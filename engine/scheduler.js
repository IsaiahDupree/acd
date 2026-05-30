#!/usr/bin/env node

/**
 * ACD Scheduler Daemon
 * ====================
 *
 * A REAL scheduler that actually reads data/schedule.json and triggers runs.
 * (The original `acd_schedule` MCP tool was a write-only no-op — nothing ever
 * read the schedule file. This closes that loop.)
 *
 * Schedule entry shape (one element of the array — see SCHEDULE_FILE):
 *   {
 *     id:        string,            // stable id (auto-generated if missing)
 *     slug:      string,            // project slug → data/features/<slug>.json
 *     cadence:   'once'|'daily'|'weekly'|'cron',
 *     cronExpr?: string,            // 5-field cron, required when cadence==='cron'
 *     runAt?:    string (ISO),      // explicit time-of-first-run (once / daily / weekly anchor)
 *     repoPath:  string,            // absolute path to the target repo
 *     enabled:   boolean,           // default true
 *     lastRun?:  string (ISO),      // set by the daemon after each trigger
 *     nextRun?:  string (ISO)       // computed by the daemon
 *   }
 *
 * The file on disk may be either a bare array OR the legacy `{ jobs: [...] }`
 * wrapper written by the acd_schedule MCP tool. Both are accepted on read; we
 * persist back in whichever shape we loaded so we never surprise the writer.
 *
 * Legacy field aliases also accepted (from the original MCP tool):
 *   schedule   → cadence
 *   targetPath → repoPath
 *
 * Cadences supported:
 *   once   — fire exactly once at runAt (or immediately if runAt is past/absent),
 *            then auto-disable.
 *   daily  — fire every day at the HH:MM of runAt (defaults to now's time).
 *   weekly — fire every 7 days, anchored to runAt's weekday + time.
 *   cron   — standard 5-field cron: "min hour day-of-month month day-of-week".
 *            Supports: star, exact numbers, lists (1,15), ranges (1-5),
 *            and step values (star-slash-15, 0-30/10). No named months/days.
 *
 * CLI:
 *   node scheduler.js            run the daemon (poll every ~30s)
 *   node scheduler.js --list     print all entries + computed nextRun, then exit
 *   node scheduler.js --once     evaluate the schedule a single time (cron-friendly)
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SCHEDULE_FILE, LOGS_DIR, ENGINE_DIR, featureFile,
} from './paths.js';

const LOG_FILE = path.join(LOGS_DIR, 'scheduler.log');
const POLL_INTERVAL_MS = 30 * 1000; // 30s daemon tick

// ── Auth guard: ACD must never use the Claude API key ────────────────────────
if (process.env.ANTHROPIC_API_KEY) {
  console.error('[scheduler] FATAL: ANTHROPIC_API_KEY is set — ACD uses OAuth only. Unset it.');
  process.exit(2);
}

// ── Logging ──────────────────────────────────────────────────────────────────
function log(message, level = 'info') {
  const ts = new Date().toISOString();
  const line = `${ts} [${level}] ${message}`;
  console.log(line);
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // logging is best-effort
  }
}

// ── Schedule file IO ──────────────────────────────────────────────────────────
// Returns { entries: [...], wrapped: bool } so we can write back in the same shape.
function loadSchedule() {
  if (!fs.existsSync(SCHEDULE_FILE)) {
    return { entries: [], wrapped: false };
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
  } catch (e) {
    log(`Failed to parse schedule file (${e.message}) — treating as empty`, 'warning');
    return { entries: [], wrapped: false };
  }
  if (Array.isArray(raw)) return { entries: raw, wrapped: false };
  if (raw && Array.isArray(raw.jobs)) return { entries: raw.jobs, wrapped: true };
  return { entries: [], wrapped: false };
}

// Atomic-ish write: write to a temp file then rename, so a crash mid-write can't
// corrupt the schedule the MCP tool also reads/writes.
function saveSchedule(entries, wrapped) {
  const payload = wrapped ? { jobs: entries } : entries;
  const json = JSON.stringify(payload, null, 2);
  const dir = path.dirname(SCHEDULE_FILE);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${SCHEDULE_FILE}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, json, 'utf-8');
    fs.renameSync(tmp, SCHEDULE_FILE);
    return true;
  } catch (e) {
    log(`Failed to write schedule file: ${e.message}`, 'error');
    return false;
  }
}

// ── Entry normalization ────────────────────────────────────────────────────────
// Reconcile the task-spec field names with the legacy MCP-tool field names.
function normalizeEntry(entry, index) {
  const cadence = (entry.cadence || entry.schedule || 'once').toLowerCase();
  const repoPath = entry.repoPath || entry.targetPath || null;
  const id = entry.id || entry.slug || `sched-${index}`;
  return {
    ...entry,
    id,
    slug: entry.slug || null,
    cadence,
    cronExpr: entry.cronExpr || entry.cron || null,
    runAt: entry.runAt || null,
    repoPath,
    enabled: entry.enabled !== false,
    lastRun: entry.lastRun || null,
    nextRun: entry.nextRun || null,
  };
}

// ── Minimal 5-field cron parser (Node builtins only) ───────────────────────────
// Fields: minute hour day-of-month month day-of-week
//   minute 0-59 · hour 0-23 · dom 1-31 · month 1-12 · dow 0-6 (0=Sunday)
// Each field: '*' | n | a-b | a,b,c | * /step | a-b/step
function parseCronField(field, min, max) {
  const out = new Set();
  for (const part of String(field).split(',')) {
    let step = 1;
    let range = part;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      step = parseInt(part.slice(slash + 1), 10);
      range = part.slice(0, slash);
      if (!Number.isInteger(step) || step <= 0) throw new Error(`bad step in "${part}"`);
    }
    let lo;
    let hi;
    if (range === '*') {
      lo = min;
      hi = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-').map((x) => parseInt(x, 10));
      lo = a;
      hi = b;
    } else {
      lo = parseInt(range, 10);
      hi = lo;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`field "${field}" out of range [${min}-${max}]`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

function parseCron(expr) {
  const fields = String(expr).trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`cron must have 5 fields, got ${fields.length}: "${expr}"`);
  }
  return {
    minute: parseCronField(fields[0], 0, 59),
    hour: parseCronField(fields[1], 0, 23),
    dom: parseCronField(fields[2], 1, 31),
    month: parseCronField(fields[3], 1, 12),
    dow: parseCronField(fields[4], 0, 6),
  };
}

function cronMatches(sets, d) {
  // Standard cron: when BOTH dom and dow are restricted, match if EITHER matches.
  const domRestricted = sets.dom.size !== 31;
  const dowRestricted = sets.dow.size !== 7;
  const dayOk = domRestricted && dowRestricted
    ? (sets.dom.has(d.getDate()) || sets.dow.has(d.getDay()))
    : (sets.dom.has(d.getDate()) && sets.dow.has(d.getDay()));
  return (
    sets.minute.has(d.getMinutes())
    && sets.hour.has(d.getHours())
    && sets.month.has(d.getMonth() + 1)
    && dayOk
  );
}

// Next cron time strictly after `from`. Scans minute-by-minute up to ~366 days.
function nextCronTime(expr, from) {
  const sets = parseCron(expr);
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1); // strictly after `from`
  const horizon = 366 * 24 * 60; // minutes in a year + leap day
  for (let i = 0; i < horizon; i += 1) {
    if (cronMatches(sets, d)) return new Date(d.getTime());
    d.setMinutes(d.getMinutes() + 1);
  }
  return null; // unsatisfiable (e.g. Feb 30)
}

// ── nextRun computation per cadence ─────────────────────────────────────────────
function computeNextRun(entry, from = new Date()) {
  const { cadence } = entry;

  if (cadence === 'cron') {
    if (!entry.cronExpr) throw new Error(`cron entry "${entry.id}" missing cronExpr`);
    return nextCronTime(entry.cronExpr, from);
  }

  if (cadence === 'once') {
    if (!entry.runAt) return new Date(from.getTime()); // no anchor → run ASAP
    return new Date(entry.runAt);
  }

  if (cadence === 'daily' || cadence === 'weekly') {
    const periodMs = (cadence === 'weekly' ? 7 : 1) * 24 * 60 * 60 * 1000;
    // Anchor defines the time-of-day (and weekday for weekly).
    const anchor = entry.runAt ? new Date(entry.runAt) : new Date(from.getTime());
    if (Number.isNaN(anchor.getTime())) throw new Error(`invalid runAt for "${entry.id}"`);
    let next = new Date(anchor.getTime());
    // Advance in whole periods until strictly after `from`.
    if (next <= from) {
      const elapsed = from.getTime() - next.getTime();
      const periods = Math.floor(elapsed / periodMs) + 1;
      next = new Date(next.getTime() + periods * periodMs);
    }
    return next;
  }

  throw new Error(`unknown cadence "${cadence}" for entry "${entry.id}"`);
}

// ── Trigger a run by spawning run-harness-v2.js for a single repo ───────────────
function triggerRun(entry) {
  if (!entry.repoPath) {
    log(`Entry "${entry.id}" has no repoPath — cannot trigger`, 'error');
    return false;
  }
  if (!fs.existsSync(entry.repoPath)) {
    log(`Entry "${entry.id}" repoPath does not exist: ${entry.repoPath}`, 'error');
    return false;
  }

  const projectId = entry.slug || path.basename(entry.repoPath);
  const harness = path.join(ENGINE_DIR, 'run-harness-v2.js');
  const args = [
    harness,
    `--path=${entry.repoPath}`,
    `--project=${projectId}`,
    '--until-complete',
    '--adaptive-delay',
  ];

  // Point the harness at the canonical per-slug feature list when it exists,
  // and skip the initializer (feature list already authored).
  if (entry.slug) {
    const fl = featureFile(entry.slug);
    if (fs.existsSync(fl)) {
      args.push(`--feature-list=${fl}`);
      args.push('--force-coding');
    }
  }
  if (entry.model) args.push(`--model=${entry.model}`);

  // Per-run log file so concurrent triggers don't interleave.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runLogPath = path.join(LOGS_DIR, `sched-${projectId}-${stamp}.log`);
  let runLogFd;
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    runLogFd = fs.openSync(runLogPath, 'a');
  } catch (e) {
    log(`Could not open run log for "${entry.id}": ${e.message}`, 'warning');
    runLogFd = 'ignore';
  }

  const spawnEnv = { ...process.env };
  delete spawnEnv.CLAUDECODE; // allow nested claude sessions spawned by the harness

  log(`Triggering "${entry.id}" → node ${args.join(' ')}`, 'info');
  try {
    const proc = spawn('node', args, {
      cwd: ENGINE_DIR,
      detached: true, // outlive a --once invocation / daemon restart
      stdio: ['ignore', runLogFd, runLogFd],
      env: spawnEnv,
    });
    proc.unref();
    log(`Spawned run for "${entry.id}" (pid ${proc.pid}) → ${runLogPath}`, 'info');
    return true;
  } catch (e) {
    log(`Failed to spawn run for "${entry.id}": ${e.message}`, 'error');
    return false;
  }
}

// ── One evaluation pass over the whole schedule ─────────────────────────────────
function tick() {
  const { entries: rawEntries, wrapped } = loadSchedule();
  if (rawEntries.length === 0) return { triggered: 0, total: 0 };

  const now = new Date();
  const entries = rawEntries.map((e, i) => normalizeEntry(e, i));
  let changed = false;
  let triggered = 0;

  for (const entry of entries) {
    if (!entry.enabled) continue;

    // Ensure nextRun is populated (first time we see this entry).
    if (!entry.nextRun) {
      try {
        const nr = computeNextRun(entry, now);
        entry.nextRun = nr ? nr.toISOString() : null;
        changed = true;
      } catch (e) {
        log(`Skipping "${entry.id}": ${e.message}`, 'warning');
        continue;
      }
      if (!entry.nextRun) {
        log(`Skipping "${entry.id}": no satisfiable next run time`, 'warning');
        continue;
      }
    }

    const due = new Date(entry.nextRun) <= now;
    if (!due) continue;

    const ok = triggerRun(entry);
    entry.lastRun = now.toISOString();
    triggered += ok ? 1 : 0;
    changed = true;

    if (entry.cadence === 'once') {
      // Fire once then auto-disable so it never re-triggers.
      entry.enabled = false;
      entry.nextRun = null;
    } else {
      try {
        const nr = computeNextRun(entry, now);
        entry.nextRun = nr ? nr.toISOString() : null;
      } catch (e) {
        log(`Could not recompute nextRun for "${entry.id}": ${e.message}`, 'warning');
        entry.nextRun = null;
      }
    }
  }

  if (changed) saveSchedule(entries, wrapped);
  return { triggered, total: entries.length };
}

// ── --list: print the schedule with computed nextRun ────────────────────────────
function listSchedule() {
  const { entries: rawEntries } = loadSchedule();
  const now = new Date();
  if (rawEntries.length === 0) {
    console.log('No scheduled entries.');
    console.log(`Schedule file: ${SCHEDULE_FILE}`);
    return;
  }
  console.log(`Schedule (${rawEntries.length} entr${rawEntries.length === 1 ? 'y' : 'ies'}) — ${SCHEDULE_FILE}\n`);
  rawEntries.map((e, i) => normalizeEntry(e, i)).forEach((entry) => {
    let next = entry.nextRun;
    if (!next && entry.enabled) {
      try {
        const nr = computeNextRun(entry, now);
        next = nr ? nr.toISOString() : '(unsatisfiable)';
      } catch (e) {
        next = `(error: ${e.message})`;
      }
    }
    const state = entry.enabled ? 'enabled' : 'disabled';
    const cad = entry.cadence === 'cron' ? `cron "${entry.cronExpr}"` : entry.cadence;
    console.log(`• [${state}] ${entry.id} (slug=${entry.slug || '?'})`);
    console.log(`    cadence : ${cad}`);
    console.log(`    repoPath: ${entry.repoPath || '(none)'}`);
    console.log(`    lastRun : ${entry.lastRun || '(never)'}`);
    console.log(`    nextRun : ${next || '(n/a — disabled)'}`);
  });
}

// ── Daemon loop ─────────────────────────────────────────────────────────────────
function runDaemon() {
  log(`Scheduler daemon starting (pid ${process.pid}) — polling every ${POLL_INTERVAL_MS / 1000}s`, 'info');
  log(`Watching ${SCHEDULE_FILE}`, 'info');

  const safeTick = () => {
    try {
      const { triggered, total } = tick();
      if (triggered > 0) log(`Tick: triggered ${triggered}/${total} entr${total === 1 ? 'y' : 'ies'}`, 'info');
    } catch (e) {
      log(`Tick error: ${e.message}`, 'error');
    }
  };

  safeTick(); // run immediately on start
  const timer = setInterval(safeTick, POLL_INTERVAL_MS);

  const shutdown = (sig) => {
    log(`Received ${sig} — shutting down scheduler`, 'info');
    clearInterval(timer);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
// Only act as a CLI when invoked directly (not when imported by tests/other modules).
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
if (!invokedDirectly) {
  // imported as a module — expose functions only, do nothing else
} else if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`ACD Scheduler

Usage:
  node scheduler.js            Run the daemon (polls every ${POLL_INTERVAL_MS / 1000}s)
  node scheduler.js --list     List all entries with computed nextRun, then exit
  node scheduler.js --once     Evaluate the schedule a single time, then exit
  node scheduler.js --help     Show this help

Schedule file: ${SCHEDULE_FILE}
Cadences: once, daily, weekly, cron (5-field: "min hour dom month dow")`);
  process.exit(0);
} else if (argv.includes('--list')) {
  listSchedule();
  process.exit(0);
} else if (argv.includes('--once')) {
  try {
    const { triggered, total } = tick();
    log(`--once: triggered ${triggered}/${total} entr${total === 1 ? 'y' : 'ies'}`, 'info');
    process.exit(0);
  } catch (e) {
    log(`--once failed: ${e.message}`, 'error');
    process.exit(1);
  }
} else {
  runDaemon();
}

export { parseCron, nextCronTime, computeNextRun, normalizeEntry, tick };
