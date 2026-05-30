/**
 * Global Concurrency Cap
 * ======================
 * A shared-file counting semaphore that bounds the TOTAL number of concurrent
 * `claude` processes across ALL workers/queues on this machine — independent of
 * how many run-queue / run-harness processes are launched.
 *
 * Without this, "scaling" = launching N independent processes with no global
 * bound, which can blow past plan limits and starve the box. With it, every
 * worker must acquire a slot before spawning claude and release it after, and
 * the sum of held slots never exceeds ACD_MAX_CONCURRENCY (default 4).
 *
 * State file: data/metrics/concurrency.json  { holders: { "<token>": {...} } }
 * Lock file:  data/metrics/concurrency.lock  (same lockfile pattern as
 *             rate-limit-coordinator.js — atomic O_EXCL create + PID liveness)
 */

import fs from 'fs';
import path from 'path';
import { METRICS_DIR } from './paths.js';

const STATE_FILE = path.join(METRICS_DIR, 'concurrency.json');
const LOCK_FILE  = path.join(METRICS_DIR, 'concurrency.lock');

const LOCK_TIMEOUT_MS = 3000;   // give up acquiring the lock after 3s
const LOCK_RETRY_MS   = 40;
const STALE_HOLDER_MS = 30 * 60 * 1000; // reclaim slots held by dead/stuck PIDs after 30 min
const SLOT_RETRY_MS   = 2000;   // poll interval while waiting for a free slot

const PID = process.pid;

function defaultMax() {
  const n = parseInt(process.env.ACD_MAX_CONCURRENCY || '4', 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

function ensureDir() {
  try { fs.mkdirSync(METRICS_DIR, { recursive: true }); } catch { /* exists */ }
}

// ── Lock helpers (atomic create-exclusive) ─────────────────────────────────
async function acquireLock() {
  ensureDir();
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(LOCK_FILE, String(PID), { flag: 'wx' });
      return true;
    } catch {
      // If the lock holder is dead, steal the lock.
      try {
        const owner = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
        if (Number.isFinite(owner) && !isPidAlive(owner)) {
          try { fs.unlinkSync(LOCK_FILE); } catch { /* race */ }
          continue;
        }
      } catch { /* lock vanished — retry */ }
      await new Promise(r => setTimeout(r, LOCK_RETRY_MS));
    }
  }
  return false; // degraded mode — caller proceeds without strict atomicity
}

function releaseLock() {
  try {
    const owner = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
    if (owner === PID) fs.unlinkSync(LOCK_FILE);
  } catch { /* already gone */ }
}

// ── State I/O ──────────────────────────────────────────────────────────────
function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (s && typeof s === 'object' && s.holders) return s;
    }
  } catch { /* corrupt */ }
  return { holders: {} };
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch { /* non-fatal */ }
}

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Drop holders whose PID is dead, or that are stale beyond STALE_HOLDER_MS.
function pruneHolders(state) {
  const now = Date.now();
  for (const [token, h] of Object.entries(state.holders)) {
    const age = now - new Date(h.acquiredAt || 0).getTime();
    const dead = !isPidAlive(Number(h.pid));
    if (dead || age > STALE_HOLDER_MS) delete state.holders[token];
  }
  return state;
}

function newToken() {
  return `${PID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Acquire one global slot, blocking (polling) until one is free.
 * Returns an opaque token to pass to releaseSlot().
 *
 * @param {number} [maxGlobal] hard cap (default ACD_MAX_CONCURRENCY or 4)
 * @param {object} [opts] { label, log, maxWaitMs }
 */
export async function acquireSlot(maxGlobal = defaultMax(), opts = {}) {
  const { label = null, log = () => {}, maxWaitMs = Infinity } = opts;
  const cap = Number.isFinite(maxGlobal) && maxGlobal > 0 ? maxGlobal : defaultMax();
  const token = newToken();
  const start = Date.now();
  let warned = false;

  while (true) {
    const locked = await acquireLock();
    try {
      const state = pruneHolders(readState());
      const held = Object.keys(state.holders).length;
      if (held < cap) {
        state.holders[token] = {
          pid: PID,
          label: label || null,
          acquiredAt: new Date().toISOString(),
        };
        writeState(state);
        log(`[concurrency] acquired slot ${held + 1}/${cap}${label ? ` (${label})` : ''}`);
        return token;
      }
      if (!warned) {
        log(`[concurrency] global cap ${cap} reached (${held} held) — waiting for a slot${label ? ` (${label})` : ''}`);
        warned = true;
      }
    } finally {
      if (locked) releaseLock();
    }

    if (Date.now() - start >= maxWaitMs) {
      log(`[concurrency] max wait reached — proceeding without a slot (degraded)`);
      return null; // degraded: caller still runs, just untracked
    }
    await new Promise(r => setTimeout(r, SLOT_RETRY_MS));
  }
}

/**
 * Release a previously acquired slot. Safe to call with null (no-op).
 */
export async function releaseSlot(token, opts = {}) {
  const { log = () => {} } = opts;
  if (!token) return;
  const locked = await acquireLock();
  try {
    const state = pruneHolders(readState());
    if (state.holders[token]) {
      delete state.holders[token];
      writeState(state);
      const held = Object.keys(state.holders).length;
      log(`[concurrency] released slot (${held} now held)`);
    }
  } finally {
    if (locked) releaseLock();
  }
}

/**
 * Snapshot of current global concurrency (for dashboards / debugging).
 */
export function snapshot() {
  const state = pruneHolders(readState());
  return {
    cap: defaultMax(),
    held: Object.keys(state.holders).length,
    holders: state.holders,
  };
}

export default { acquireSlot, releaseSlot, snapshot };
