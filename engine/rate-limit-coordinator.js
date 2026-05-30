/**
 * Global Rate Limit Coordinator
 * ==============================
 * Shared JSON state file that all concurrent harness processes read/write.
 * Allows any process to broadcast a rate limit hit so peers back off
 * instead of also hitting the API and compounding the problem.
 *
 * State file: harness/.rate-limit-state.json
 * Lock file:  harness/.rate-limit-state.lock
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '.rate-limit-state.json');
const LOCK_FILE  = path.join(__dirname, '.rate-limit-state.lock');

const LOCK_TIMEOUT_MS   = 2000;   // Give up acquiring lock after 2s
const LOCK_RETRY_MS     = 50;
const STALE_PID_MS      = 5 * 60 * 1000;  // Treat entries older than 5 min with dead PIDs as stale
const MIN_BACKOFF_MS    = 10 * 1000;       // 10s minimum global wait
const MAX_GLOBAL_WAIT_MS = 25 * 60 * 1000; // 25 min maximum wait

// ── Lock helpers ──────────────────────────────────────────────────────────────

async function acquireLock() {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, LOCK_RETRY_MS));
    }
  }
  return false; // Couldn't acquire — proceed anyway (non-blocking degraded mode)
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch { /* already gone */ }
}

// ── State I/O ─────────────────────────────────────────────────────────────────

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch { /* corrupt file */ }
  return { processes: {}, globalPause: null };
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch { /* non-fatal */ }
}

// ── PID liveness check ────────────────────────────────────────────────────────

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pruneDeadProcesses(state) {
  const now = Date.now();
  for (const [pid, entry] of Object.entries(state.processes)) {
    const age = now - new Date(entry.updatedAt).getTime();
    if (age > STALE_PID_MS && !isPidAlive(Number(pid))) {
      delete state.processes[pid];
    }
  }
  // Clear global pause if it's expired
  if (state.globalPause && new Date(state.globalPause.until).getTime() < now) {
    state.globalPause = null;
  }
  return state;
}

// ── Public API ────────────────────────────────────────────────────────────────

const PID = process.pid;

/**
 * Register this process in the coordinator. Call once at harness start.
 */
export function register(projectId) {
  acquireLock().then(locked => {
    const state = pruneDeadProcesses(readState());
    state.processes[PID] = {
      projectId,
      status: 'running',
      rateLimited: false,
      model: null,
      updatedAt: new Date().toISOString(),
    };
    writeState(state);
    if (locked) releaseLock();
  }).catch(e => console.error(`[rateCoord] register failed: ${e.message}`));
}

/**
 * Deregister this process from the coordinator. Call on harness exit.
 */
export function deregister() {
  acquireLock().then(locked => {
    const state = pruneDeadProcesses(readState());
    delete state.processes[PID];
    writeState(state);
    if (locked) releaseLock();
  }).catch(e => console.error(`[rateCoord] deregister failed: ${e.message}`));
}

/**
 * Report that this process hit a rate limit on a model.
 * Optionally pass resetAt (ISO string) if the API told us when it resets.
 */
export async function reportRateLimit(model, { resetAt = null, projectId = null } = {}) {
  const locked = await acquireLock();
  try {
    const state = pruneDeadProcesses(readState());
    const now = Date.now();

    // Calculate until time
    let until;
    if (resetAt) {
      until = new Date(Math.max(new Date(resetAt).getTime() + 60_000, now + MIN_BACKOFF_MS)).toISOString();
    } else {
      until = new Date(now + 20 * 60 * 1000).toISOString(); // default 20 min
    }

    // Update this process entry
    state.processes[PID] = {
      ...(state.processes[PID] || {}),
      projectId: projectId || state.processes[PID]?.projectId,
      status: 'rate_limited',
      rateLimited: true,
      model,
      rateLimitedAt: new Date().toISOString(),
      rateLimitUntil: until,
      updatedAt: new Date().toISOString(),
    };

    // Set/extend global pause if this is earlier or no global pause exists
    if (!state.globalPause || new Date(until) > new Date(state.globalPause.until)) {
      state.globalPause = {
        until,
        reason: `Process ${PID} (${projectId || '?'}) hit rate limit on ${model}`,
        setBy: PID,
        setAt: new Date().toISOString(),
      };
    }

    writeState(state);
  } finally {
    if (locked) releaseLock();
  }
}

/**
 * Report a successful session — clears this process's rate-limited flag.
 */
export async function reportSuccess(model) {
  const locked = await acquireLock();
  try {
    const state = pruneDeadProcesses(readState());
    if (state.processes[PID]) {
      state.processes[PID].rateLimited = false;
      state.processes[PID].status = 'running';
      state.processes[PID].model = model;
      state.processes[PID].updatedAt = new Date().toISOString();
    }
    // Clear global pause if NO process is still rate-limited
    const anyLimited = Object.values(state.processes).some(p => p.rateLimited);
    if (!anyLimited) state.globalPause = null;
    writeState(state);
  } finally {
    if (locked) releaseLock();
  }
}

/**
 * Check current global rate limit state without waiting.
 * Returns { limited: bool, until: Date|null, waitMs: number, reason: string|null }
 */
export function checkGlobalState() {
  const state = pruneDeadProcesses(readState());
  const now = Date.now();

  if (!state.globalPause) return { limited: false, until: null, waitMs: 0, reason: null, peerCount: Object.keys(state.processes).length };

  const until = new Date(state.globalPause.until).getTime();
  if (until <= now) return { limited: false, until: null, waitMs: 0, reason: null, peerCount: Object.keys(state.processes).length };

  const waitMs = Math.min(until - now, MAX_GLOBAL_WAIT_MS);
  return {
    limited: true,
    until: new Date(until),
    waitMs,
    reason: state.globalPause.reason,
    peerCount: Object.keys(state.processes).length,
  };
}

/**
 * Get full state snapshot for dashboard display.
 */
export function getSnapshot() {
  return pruneDeadProcesses(readState());
}

/**
 * Wait if a peer process has broadcast a global rate limit.
 * Pass a log function for status output. Returns actual ms waited.
 */
export async function waitIfRateLimited(log = console.log) {
  const check = checkGlobalState();
  if (!check.limited) return 0;

  // Don't wait if WE are the one that set the rate limit (we handle our own wait)
  const state = readState();
  if (state.globalPause?.setBy === PID) return 0;

  const waitMin = (check.waitMs / 60000).toFixed(1);
  log(`[RateCoord] Peer rate limit detected — backing off ${waitMin}m. Reason: ${check.reason}`);

  const start = Date.now();
  const POLL_INTERVAL = 30_000; // recheck every 30s

  while (true) {
    await new Promise(r => setTimeout(r, Math.min(POLL_INTERVAL, check.waitMs)));
    const recheck = checkGlobalState();
    if (!recheck.limited) break;
    if (Date.now() - start >= MAX_GLOBAL_WAIT_MS) {
      log('[RateCoord] Max global wait reached, resuming anyway');
      break;
    }
    const remaining = (recheck.waitMs / 60000).toFixed(1);
    log(`[RateCoord] Still rate limited globally, ${remaining}m remaining...`);
  }

  const waited = Date.now() - start;
  log(`[RateCoord] Global rate limit cleared after ${(waited / 60000).toFixed(1)}m`);
  return waited;
}
