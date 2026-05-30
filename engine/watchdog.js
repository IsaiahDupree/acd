#!/usr/bin/env node

/**
 * ACD Watchdog
 * ============
 * Monitors run-queue.js for stalls and stale progress. Auto-restarts.
 * Calls the Doctor Agent (Claude Code SDK) for self-healing before hard-restart.
 *
 * Stall:  run-queue.js PID is dead or in STOPPED (T) state
 * Stale:  heartbeat file not updated in > STALE_HEARTBEAT_MINUTES
 *         OR no feature progress for > STALE_PROGRESS_MINUTES
 *
 * Usage:
 *   node watchdog.js                    # Monitor only (queue must already be running)
 *   node watchdog.js --start-queue      # Also start queue if none running
 *   node watchdog.js --status           # Print watchdog state and exit
 *   node watchdog.js --doctor           # Run doctor agent manually and exit
 *
 * Exports (for testing):
 *   getProcessState, findQueuePid, canRestart, buildHeartbeatCheck,
 *   buildProgressCheck, buildStallCheck, STALE_HEARTBEAT_MINUTES, STALE_PROGRESS_MINUTES
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runDoctorAgent } from './doctor-agent.js';
import { ENGINE_DIR, LOGS_DIR, METRICS_DIR, QUEUE_FILE } from './paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────────────────
// The heartbeat is WRITTEN by run-queue.js into data/metrics (METRICS_DIR);
// the watchdog reads it from the same place. Watchdog-private state lives next
// to the engine (singleton per package).
const HEARTBEAT_FILE         = path.join(METRICS_DIR, 'watchdog-heartbeat.json');
const WATCHDOG_STATE_FILE    = path.join(ENGINE_DIR, 'watchdog-state.json');
const QUEUE_STATUS_FILE      = path.join(METRICS_DIR, 'queue-status.json');
// Logs route to the canonical data/logs dir.
const QUEUE_LOG_FILE         = path.join(LOGS_DIR, 'watchdog-queue.log');
const WATCHDOG_LOG_FILE      = path.join(LOGS_DIR, 'watchdog-monitor.log');

const CHECK_INTERVAL_MS       = 60 * 1000;   // Poll every 60s
export const STALE_HEARTBEAT_MINUTES = 10;    // No heartbeat update in 10 min → stale
export const STALE_PROGRESS_MINUTES  = 60;    // No feature progress in 60 min → stale
const MAX_RESTARTS_PER_HOUR   = 5;            // Circuit breaker
const RESTART_GRACE_MS        = 3 * 60 * 1000; // Wait 3 min before checking after restart
const STARTUP_GRACE_MS        = 30 * 1000;    // Wait 30s before first check
// Canonical queue (data/repo-queue.json) — same file the initial launch uses.
const REPO_QUEUE_FILE         = QUEUE_FILE;
// Global concurrency cap forwarded to restarted workers (mirrors launch.sh).
const MAX_CONCURRENCY         = process.env.ACD_MAX_CONCURRENCY || 4;

// Ensure the canonical log dir exists so log() / queue spawn never fail on a fresh package.
try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch { /* non-fatal */ }

// ── State ────────────────────────────────────────────────────────────────────
let restartHistory  = [];   // timestamps of recent restarts
let lastRestartTime = 0;
let progressSnapshot = null; // { repo, passes, ts }
const startTime = Date.now();
const args = process.argv.slice(2);
const START_QUEUE = args.includes('--start-queue');

// ── Logging ──────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(WATCHDOG_LOG_FILE, line + '\n'); } catch { /* non-fatal */ }
}

// ── State persistence ────────────────────────────────────────────────────────
function loadState() {
  try { return JSON.parse(fs.readFileSync(WATCHDOG_STATE_FILE, 'utf-8')); } catch { return {}; }
}

function saveState(patch) {
  const current = loadState();
  fs.writeFileSync(WATCHDOG_STATE_FILE, JSON.stringify({ ...current, ...patch, watchdogPid: process.pid }, null, 2));
}

// ── Process utilities ────────────────────────────────────────────────────────
export function getProcessState(pid) {
  if (!pid) return null;
  try {
    return execSync(`ps -p ${pid} -o state= 2>/dev/null`, { encoding: 'utf-8' }).trim() || null;
  } catch { return null; }
}

export function findQueuePid() {
  try {
    const result = execSync(`pgrep -f 'run-queue.js' 2>/dev/null || echo ''`, { encoding: 'utf-8' }).trim();
    const pids = result.split('\n').filter(Boolean).map(Number);
    // Exclude self (watchdog might match)
    return pids.find(p => p !== process.pid) || null;
  } catch { return null; }
}

function killStaleProcesses() {
  log('🔪 Sending SIGTERM to stale queue/harness processes…');
  for (const pattern of ['run-queue.js', 'run-harness-v2.js']) {
    try { execSync(`pkill -TERM -f '${pattern}' 2>/dev/null || true`); } catch { /* ok */ }
  }
  // SIGKILL after 4s if still alive
  setTimeout(() => {
    for (const pattern of ['run-queue.js', 'run-harness-v2.js']) {
      try { execSync(`pkill -KILL -f '${pattern}' 2>/dev/null || true`); } catch { /* ok */ }
    }
  }, 4000);
}

function startQueue() {
  const queueScript = path.join(ENGINE_DIR, 'run-queue.js');
  if (!fs.existsSync(queueScript)) {
    log(`❌ run-queue.js not found at ${queueScript}`);
    return null;
  }
  // Forward the SAME canonical queue + global concurrency cap that the initial
  // launch (engine/launch.sh) used, plus --loop, so a watchdog restart does not
  // revert the worker to engine/repo-queue.json at single-slot concurrency.
  const queueArgs = [
    queueScript,
    `--queue=${REPO_QUEUE_FILE}`,
    `--total-slots=${MAX_CONCURRENCY}`,
    '--loop',
  ];
  const fd = fs.openSync(QUEUE_LOG_FILE, 'a');
  const child = spawn('node', queueArgs, {
    cwd: ENGINE_DIR,
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, ACD_MAX_CONCURRENCY: String(MAX_CONCURRENCY) },
  });
  child.unref();
  log(`🚀 Spawned run-queue.js — PID ${child.pid} (queue=${REPO_QUEUE_FILE}, total-slots=${MAX_CONCURRENCY}, loop)`);
  return child.pid;
}

// ── Circuit breaker ──────────────────────────────────────────────────────────
export function canRestart() {
  const now = Date.now();
  restartHistory = restartHistory.filter(t => now - t < 60 * 60 * 1000);
  if (restartHistory.length >= MAX_RESTARTS_PER_HOUR) {
    log(`⛔ Circuit breaker: ${restartHistory.length}/${MAX_RESTARTS_PER_HOUR} restarts in last hour. Manual intervention needed.`);
    return false;
  }
  return true;
}

// ── Restart logic (with doctor-first healing) ───────────────────────────────
export async function triggerRestart(reason, { skipDoctor = false } = {}) {
  if (!canRestart()) return;

  const now = Date.now();
  if (now - lastRestartTime < RESTART_GRACE_MS) {
    log(`⏳ Restart suppressed (within ${RESTART_GRACE_MS / 60000} min grace period) — reason was: ${reason}`);
    return;
  }

  log(`🚨 Issue detected — reason: ${reason}`);

  // ── Doctor Agent: try to self-heal before hard restart ──
  if (!skipDoctor) {
    log('🩺 Calling Doctor Agent for self-healing diagnosis…');
    try {
      let hb = null;
      try { hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8')); } catch { /* ok */ }
      const diagnosis = await runDoctorAgent({
        reason,
        currentRepo: hb?.currentRepo || loadState().currentRepo || null,
      });
      log(`🩺 Doctor result: healed=${diagnosis.healed}, restartRecommended=${diagnosis.restartRecommended}`);
      if (diagnosis.healed && !diagnosis.restartRecommended) {
        log('✅ Doctor healed the issue — skipping hard restart');
        progressSnapshot = null; // Reset so next check starts fresh
        return;
      }
      log(`🩺 Doctor could not heal: ${diagnosis.rootCause || reason} — proceeding with restart`);
    } catch (e) {
      log(`⚠️  Doctor agent error: ${e.message} — proceeding with restart`);
    }
  }

  log(`🔄 RESTARTING queue — reason: ${reason}`);
  killStaleProcesses();

  await new Promise(r => setTimeout(r, 5000));

  const pid = startQueue();
  if (!pid) return;

  restartHistory.push(now);
  lastRestartTime = now;
  progressSnapshot = null;

  const state = loadState();
  const restartCount = (state.restartCount || 0) + 1;
  saveState({
    queuePid: pid,
    restartCount,
    lastRestart: new Date().toISOString(),
    lastRestartReason: reason,
  });
  log(`✅ Queue restarted (restart #${restartCount} total)`);
}

// ── Queue summary (for log enrichment) ─────────────────────────────────────
function queueSummaryLine() {
  try {
    const qs = JSON.parse(fs.readFileSync(QUEUE_STATUS_FILE, 'utf-8'));
    const rq = JSON.parse(fs.readFileSync(REPO_QUEUE_FILE, 'utf-8'));
    const done    = new Set(qs.completedRepos || []);
    const total   = (rq.repos || []).filter(r => r.enabled !== false).length;
    const pending = total - done.size - (qs.currentRepo ? 1 : 0);
    return `[queue: ${done.size} done / 1 active / ${pending} pending / ${total} total | repo: ${qs.currentRepo || 'idle'}]`;
  } catch { return ''; }
}

// ── Exported pure-logic checks (used by tests) ────────────────────────────────
export function buildStallCheck(procState, pid) {
  if (procState === null) return { stalled: true, reason: `PID ${pid} is dead` };
  if (procState.includes('T')) return { stalled: true, reason: `PID ${pid} suspended (state=${procState})` };
  return { stalled: false };
}

export function buildHeartbeatCheck(hbTs, nowMs, thresholdMin) {
  const ageMin = (nowMs - new Date(hbTs).getTime()) / 60000;
  return { stale: ageMin > thresholdMin, ageMin };
}

export function buildProgressCheck(snapshot, currentRepo, passingCount, nowMs, thresholdMin) {
  if (!snapshot) return { action: 'init', snapshot: { repo: currentRepo, passes: passingCount, ts: nowMs } };
  if (currentRepo !== snapshot.repo) return { action: 'repo_changed' };
  if (passingCount > snapshot.passes) return { action: 'progress' };
  const stuckMin = (nowMs - snapshot.ts) / 60000;
  if (stuckMin > thresholdMin) return { action: 'stale', stuckMin };
  if (stuckMin > 15) return { action: 'warn', stuckMin };
  return { action: 'ok', stuckMin };
}

// ── Health check ─────────────────────────────────────────────────────────────
export async function doCheck({
  _now = Date.now(),
  _startTime = startTime,
  _lastRestartTime = () => lastRestartTime,
} = {}) {
  const now = _now;

  // Skip during startup grace period
  if (now - _startTime < STARTUP_GRACE_MS) return;

  // Skip during post-restart grace period
  if (now - _lastRestartTime() < RESTART_GRACE_MS) return;

  // ── Read heartbeat ──
  let hb = null;
  if (fs.existsSync(HEARTBEAT_FILE)) {
    try { hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8')); } catch { /* corrupt */ }
  }

  // ── Stall check: PID state ──
  const trackedPid = hb?.pid || loadState().queuePid || null;

  if (trackedPid) {
    const procState = getProcessState(trackedPid);
    if (procState === null) {
      await triggerRestart(`run-queue.js PID ${trackedPid} is dead (not in process list)`);
      return;
    }
    if (procState.includes('T')) {
      await triggerRestart(`run-queue.js PID ${trackedPid} is suspended (ps state="${procState}")`);
      return;
    }
  } else {
    // No known PID — discover via pgrep
    const livePid = findQueuePid();
    if (!livePid) {
      if (START_QUEUE) {
        await triggerRestart('No run-queue.js process found');
      } else {
        log('⚠️  No run-queue.js process found. Start it manually or use --start-queue flag.');
      }
      return;
    }
    // Found a live process — save it
    saveState({ queuePid: livePid });
    log(`🔍 Discovered run-queue.js PID ${livePid}`);
  }

  // ── Stale heartbeat check ──
  if (!hb) {
    log('⚠️  No heartbeat file — queue may be starting up or not yet support watchdog');
    return;
  }

  const hbAgeMin = (now - new Date(hb.ts).getTime()) / 60000;
  if (hbAgeMin > STALE_HEARTBEAT_MINUTES) {
    await triggerRestart(`Heartbeat stale for ${hbAgeMin.toFixed(1)} min (threshold: ${STALE_HEARTBEAT_MINUTES} min, last seen: ${hb.ts})`);
    return;
  }

  // ── Stale progress check ──
  const { currentRepo, passingCount } = hb;

  if (progressSnapshot === null) {
    progressSnapshot = { repo: currentRepo, passes: passingCount, ts: now };
    return;
  }

  if (currentRepo !== progressSnapshot.repo) {
    // Repo changed = forward progress in the queue
    log(`➡️  Repo advanced: "${progressSnapshot.repo}" → "${currentRepo}"`);
    progressSnapshot = { repo: currentRepo, passes: passingCount, ts: now };
    return;
  }

  if (passingCount > progressSnapshot.passes) {
    log(`📈 Feature progress: ${progressSnapshot.passes} → ${passingCount} passes (repo: ${currentRepo})`);
    progressSnapshot = { repo: currentRepo, passes: passingCount, ts: now };
    // Reset stall counter on any forward progress so a repo isn't penalised for a past stall
    if (currentRepo) {
      const state = loadState();
      const stallKey = `stallCount_${currentRepo}`;
      if (state[stallKey]) saveState({ [stallKey]: 0 });
    }
    return;
  }

  // Same repo, same pass count — check staleness
  const progressResult = buildProgressCheck(progressSnapshot, currentRepo, passingCount, now, STALE_PROGRESS_MINUTES);
  if (progressResult.action === 'stale') {
    // Auto-skip repos stuck at 0 passes after 2 consecutive stalls
    if (passingCount === 0 && currentRepo) {
      const state = loadState();
      const stallKey = `stallCount_${currentRepo}`;
      const stallCount = (state[stallKey] || 0) + 1;
      saveState({ [stallKey]: stallCount });
      if (stallCount >= 2) {
        log(`🚫 Auto-skipping "${currentRepo}" — stuck at 0 passes for ${stallCount} stalls. Adding to completedRepos.`);
        try {
          const qsPath = QUEUE_STATUS_FILE;
          const qs = JSON.parse(fs.readFileSync(qsPath, 'utf-8'));
          if (!qs.completedRepos.includes(currentRepo)) qs.completedRepos.push(currentRepo);
          qs.currentRepo = null;
          fs.writeFileSync(qsPath, JSON.stringify(qs, null, 2));
        } catch (e) { log(`⚠️  Could not auto-skip: ${e.message}`); }
        saveState({ [stallKey]: 0 });
        progressSnapshot = null;
        await triggerRestart(`Auto-skipped "${currentRepo}" after ${stallCount} stalls at 0 passes`, { skipDoctor: true });
        return;
      }
    }
    await triggerRestart(
      `No feature progress for ${progressResult.stuckMin.toFixed(1)} min on "${currentRepo}" (stuck at ${passingCount} passes)`
    );
    progressSnapshot = null;
  } else if (progressResult.action === 'warn') {
    const summary = queueSummaryLine();
    log(`⏳ No progress for ${progressResult.stuckMin.toFixed(0)} min on "${currentRepo}" (${passingCount} passes, threshold: ${STALE_PROGRESS_MINUTES} min) ${summary}`);
  } else {
    const summary = queueSummaryLine();
    log(`✓ Healthy — ${passingCount} passes on "${currentRepo}" ${summary}`);
  }
}

// ── Status command ───────────────────────────────────────────────────────────
function printStatus() {
  const state = loadState();
  let hb = null;
  try { hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8')); } catch { /* ok */ }

  console.log('\n🛡  ACD Watchdog State\n');
  console.log(`  Watchdog PID:     ${process.pid}`);
  console.log(`  Queue PID:        ${state.queuePid || 'unknown'}`);
  if (state.queuePid) {
    const s = getProcessState(state.queuePid);
    console.log(`  Queue state:      ${s || 'dead'}`);
  }
  console.log(`  Total restarts:   ${state.restartCount || 0}`);
  console.log(`  Last restart:     ${state.lastRestart || 'never'}`);
  console.log(`  Last reason:      ${state.lastRestartReason || 'n/a'}`);
  if (hb) {
    const ageMin = ((Date.now() - new Date(hb.ts).getTime()) / 60000).toFixed(1);
    console.log(`\n  Heartbeat age:    ${ageMin} min`);
    console.log(`  Current repo:     ${hb.currentRepo || 'idle'}`);
    console.log(`  Passing features: ${hb.passingCount}`);
  } else {
    console.log('\n  Heartbeat:        not found');
  }
  console.log('');
}

// ── Entry point ──────────────────────────────────────────────────────────────
async function main() {
  if (args.includes('--status')) {
    printStatus();
    process.exit(0);
  }

  if (args.includes('--doctor')) {
    const reason = args[args.indexOf('--doctor') + 1] || 'Manual doctor invocation';
    let hb = null;
    try { hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8')); } catch { /* ok */ }
    const result = await runDoctorAgent({ reason, currentRepo: hb?.currentRepo || null });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.healed ? 0 : 1);
  }

  log('');
  log('════════════════════════════════════════════════════');
  log('  ACD Watchdog v1');
  log(`  Heartbeat stale threshold:  ${STALE_HEARTBEAT_MINUTES} min`);
  log(`  Progress stale threshold:   ${STALE_PROGRESS_MINUTES} min`);
  log(`  Max restarts per hour:      ${MAX_RESTARTS_PER_HOUR}`);
  log(`  Check interval:             ${CHECK_INTERVAL_MS / 1000}s`);
  log(`  Auto-start queue:           ${START_QUEUE}`);
  log('════════════════════════════════════════════════════');

  const state = loadState();
  if (state.restartCount) {
    log(`  Previous restart count: ${state.restartCount} (last: ${state.lastRestart})`);
  }
  saveState({ watchdogPid: process.pid, watchdogStarted: new Date().toISOString() });

  // Periodic check
  setInterval(async () => {
    try { await doCheck(); } catch (e) { log(`⚠️  Check error: ${e.message}`); }
  }, CHECK_INTERVAL_MS);

  // Initial check after startup grace
  setTimeout(
    () => doCheck().catch(e => log(`⚠️  Initial check error: ${e.message}`)),
    STARTUP_GRACE_MS
  );

  log(`👀 Watching… (PID ${process.pid}). Ctrl+C to stop.`);
}

// Guard so watchdog can be imported for testing without side-effects
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error(`Watchdog fatal: ${e.message}`);
    process.exit(1);
  });
}
