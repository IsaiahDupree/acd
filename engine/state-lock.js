/**
 * State Lock
 * ==========
 * Generic cross-process file lock for read-modify-write of small JSON state
 * files (budget-state.json, claude-usage.json, …) so concurrent workers don't
 * clobber each other's token/cost increments via lost-update races.
 *
 * Reuses the same lockfile approach as rate-limit-coordinator.js: atomic
 * O_EXCL create of `<file>.lock`, PID-liveness based steal of stale locks,
 * bounded acquire timeout with graceful (degraded) fallback.
 *
 * Usage:
 *   import { withLock } from './state-lock.js';
 *   const next = await withLock(BUDGET_STATE_FILE, (cur) => ({ ...cur, x: cur.x + 1 }), {});
 */

import fs from 'fs';

const LOCK_TIMEOUT_MS = 3000;
const LOCK_RETRY_MS   = 40;
const STALE_LOCK_MS   = 60 * 1000; // a lock held by a *live* pid this long is treated as stuck

const PID = process.pid;

function lockPath(file) { return `${file}.lock`; }

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function acquireLock(file) {
  const lf = lockPath(file);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(lf, JSON.stringify({ pid: PID, at: Date.now() }), { flag: 'wx' });
      return true;
    } catch {
      // Steal if owner is dead or the lock is clearly stuck.
      try {
        const raw = fs.readFileSync(lf, 'utf8');
        let owner = NaN, at = 0;
        try { const j = JSON.parse(raw); owner = Number(j.pid); at = Number(j.at) || 0; }
        catch { owner = parseInt(raw, 10); }
        const stuck = at && (Date.now() - at) > STALE_LOCK_MS;
        if ((Number.isFinite(owner) && !isPidAlive(owner)) || stuck) {
          try { fs.unlinkSync(lf); } catch { /* race */ }
          continue;
        }
      } catch { /* lock vanished — retry */ }
      await new Promise(r => setTimeout(r, LOCK_RETRY_MS));
    }
  }
  return false; // degraded mode
}

function releaseLock(file) {
  const lf = lockPath(file);
  try {
    const raw = fs.readFileSync(lf, 'utf8');
    let owner = NaN;
    try { owner = Number(JSON.parse(raw).pid); } catch { owner = parseInt(raw, 10); }
    if (owner === PID) fs.unlinkSync(lf);
  } catch { /* already gone */ }
}

/**
 * Read a JSON file under lock. Returns `fallback` if missing/corrupt.
 */
export async function readLocked(file, fallback = {}) {
  const locked = await acquireLock(file);
  try {
    if (fs.existsSync(file)) {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
    }
    return fallback;
  } finally {
    if (locked) releaseLock(file);
  }
}

/**
 * Atomically read-modify-write a JSON file under lock.
 *
 * @param {string} file        absolute path to the JSON state file
 * @param {(cur:any)=>any} mutate  pure-ish fn: receives current parsed state, returns next state
 * @param {object} [opts] { fallback }  state to use when file is missing/corrupt
 * @returns the written state
 */
export async function withLock(file, mutate, opts = {}) {
  const { fallback = {} } = opts;
  const locked = await acquireLock(file);
  try {
    let cur = fallback;
    if (fs.existsSync(file)) {
      try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cur = fallback; }
    }
    const next = mutate(cur);
    if (next !== undefined) {
      fs.writeFileSync(file, JSON.stringify(next, null, 2));
    }
    return next;
  } finally {
    if (locked) releaseLock(file);
  }
}

export default { withLock, readLocked };
