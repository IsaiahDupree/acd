#!/usr/bin/env node

/**
 * ACD Dashboard
 * =============
 * Rich observability CLI for the Autonomous Coding Dashboard.
 *
 * Shows:
 *   - Active repo + real-time feature progress
 *   - Full queue order (priority-sorted) with pass rates
 *   - Series vs parallel mode detection
 *   - PRD / focus info per repo
 *   - Watchdog health + last diagnosis
 *   - Recent log tail
 *
 * Usage:
 *   node acd-dashboard.js              # Full dashboard
 *   node acd-dashboard.js --watch      # Refresh every 30s
 *   node acd-dashboard.js --queue      # Queue order only
 *   node acd-dashboard.js --next N     # Show next N repos
 *   node acd-dashboard.js --json       # Machine-readable output
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── File paths ───────────────────────────────────────────────────────────────
const REPO_QUEUE_FILE    = path.join(__dirname, 'repo-queue.json');
const STATUS_FILE        = path.join(__dirname, 'queue-status.json');
const PARALLEL_FILE      = path.join(__dirname, 'parallel-status.json');
const HEARTBEAT_FILE     = path.join(__dirname, 'watchdog-heartbeat.json');
const WATCHDOG_STATE     = path.join(__dirname, 'watchdog-state.json');
const DIAGNOSIS_FILE     = path.join(__dirname, 'doctor-diagnosis.json');
const QUEUE_LOG          = path.join(__dirname, 'logs', 'watchdog-queue.log');
const WATCHDOG_LOG       = path.join(__dirname, 'logs', 'watchdog-monitor.log');
const PRD_DIR            = path.join(__dirname, '..', 'docs', 'prd');

// ── Colors (ANSI) ────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
  white:  '\x1b[97m',
  bgBlue: '\x1b[44m',
};
const NO_COLOR = process.env.NO_COLOR || !process.stdout.isTTY;
const c = (code, text) => NO_COLOR ? text : `${code}${text}${C.reset}`;

// ── Loaders ──────────────────────────────────────────────────────────────────
function load(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function getFeatureCount(featureListPath) {
  if (!featureListPath || !fs.existsSync(featureListPath)) return { total: 0, passing: 0, pct: 0 };
  try {
    const data = load(featureListPath);
    const features = data?.features || (Array.isArray(data) ? data : []);
    const passing = features.filter(f => f.passes === true).length;
    const total   = features.length;
    return { total, passing, pct: total ? Math.round((passing / total) * 100) : 0 };
  } catch { return { total: 0, passing: 0, pct: 0 }; }
}

function getProcessState(pid) {
  if (!pid) return null;
  try { return execSync(`ps -p ${pid} -o state= 2>/dev/null`, { encoding: 'utf-8' }).trim() || null; }
  catch { return null; }
}

function findPid(pattern) {
  try {
    const out = execSync(`pgrep -f '${pattern}' 2>/dev/null || echo ''`, { encoding: 'utf-8' }).trim();
    return out.split('\n').filter(Boolean).map(Number).filter(p => p !== process.pid)[0] || null;
  } catch { return null; }
}

function logTail(file, n = 8) {
  if (!fs.existsSync(file)) return [];
  try {
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    return lines.slice(-n);
  } catch { return []; }
}

function findPrdFile(repoId, repoName) {
  if (!fs.existsSync(PRD_DIR)) return null;
  try {
    const files = fs.readdirSync(PRD_DIR);
    const slug = repoId.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const nameSlug = (repoName || '').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
    const match = files.find(f => {
      const fl = f.toLowerCase();
      return fl.includes(slug) || fl.includes(nameSlug.slice(0, 15));
    });
    return match ? path.join(PRD_DIR, match) : null;
  } catch { return null; }
}

function ageStr(isoTs) {
  if (!isoTs) return 'never';
  const mins = (Date.now() - new Date(isoTs).getTime()) / 60000;
  if (mins < 1)   return `${Math.round(mins * 60)}s ago`;
  if (mins < 60)  return `${Math.round(mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function progressBar(pct, width = 20) {
  const filled = Math.round((pct / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const color = pct === 100 ? C.green : pct > 50 ? C.cyan : pct > 20 ? C.yellow : C.red;
  return c(color, bar) + c(C.dim, ` ${pct}%`);
}

// ── Mode detection ───────────────────────────────────────────────────────────
function detectMode() {
  const agent1 = findPid('repo-queue-agent1');
  const agent2 = findPid('repo-queue-agent2');
  if (agent1 || agent2) {
    return { mode: 'PARALLEL', workers: [agent1, agent2].filter(Boolean) };
  }
  const parallelStatus = load(PARALLEL_FILE);
  if (parallelStatus?.activeWorkers?.length > 1) {
    return { mode: 'PARALLEL', workers: parallelStatus.activeWorkers };
  }
  return { mode: 'SERIES', workers: [] };
}

// ── Build full queue view ────────────────────────────────────────────────────
export function buildQueueView() {
  const queue   = load(REPO_QUEUE_FILE);
  const status  = load(STATUS_FILE);
  const hb      = load(HEARTBEAT_FILE);
  const wdState = load(WATCHDOG_STATE);
  const diag    = load(DIAGNOSIS_FILE);

  if (!queue) return null;

  const completedSet = new Set(status?.completedRepos || []);
  const currentId    = status?.currentRepo || hb?.currentRepo;

  const repos = (queue.repos || [])
    .filter(r => r.enabled !== false)
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));

  const enriched = repos.map(r => {
    const fc     = getFeatureCount(r.featureList);
    const prdFile = findPrdFile(r.id, r.name);
    const state   = completedSet.has(r.id) ? 'done'
                  : r.id === currentId      ? 'active'
                  : 'pending';
    return {
      ...r,
      featureCount: fc,
      prdFile,
      state,
    };
  });

  const done    = enriched.filter(r => r.state === 'done');
  const active  = enriched.filter(r => r.state === 'active');
  const pending = enriched.filter(r => r.state === 'pending');

  const modeInfo  = detectMode();
  const queuePid  = hb?.pid || wdState?.queuePid;
  const procState = getProcessState(queuePid);
  const wdPid     = wdState?.watchdogPid;
  const wdAlive   = wdPid ? !!getProcessState(wdPid) : false;

  const hbAgeMin  = hb ? (Date.now() - new Date(hb.ts).getTime()) / 60000 : null;
  const hbHealthy = hbAgeMin !== null && hbAgeMin < 10;

  return {
    ts: new Date().toISOString(),
    mode: modeInfo,
    queue: { done, active, pending, total: enriched.length },
    status,
    hb,
    hbAgeMin,
    hbHealthy,
    queuePid,
    procState,
    wdPid,
    wdAlive,
    wdState,
    diag,
    logLines: logTail(QUEUE_LOG, 8),
    wdLogLines: logTail(WATCHDOG_LOG, 5),
  };
}

// ── Render ───────────────────────────────────────────────────────────────────
function render(view, opts = {}) {
  const W = 66;
  const line  = c(C.dim, '─'.repeat(W));
  const dline = c(C.bold, '═'.repeat(W));

  if (!view) {
    console.log(c(C.red, '  ❌ Could not load repo-queue.json'));
    return;
  }

  const { queue, mode, hb, hbAgeMin, hbHealthy, queuePid, procState, wdPid, wdAlive, wdState, diag } = view;

  console.log('');
  console.log(dline);
  console.log(c(C.bold + C.cyan, `  ACD Dashboard`) + c(C.dim, `  —  ${new Date().toISOString().replace('T',' ').slice(0,19)} UTC`));
  console.log(dline);

  // ── Mode + process health ──
  const modeLabel  = mode.mode === 'PARALLEL'
    ? c(C.yellow, `⚡ PARALLEL (${mode.workers.length} workers)`)
    : c(C.blue,   '⟶  SERIES (sequential)');
  const queueHealth = procState === null    ? c(C.red,    '❌ dead')
                    : procState.includes('T') ? c(C.red,  '⏸  SUSPENDED')
                    : procState.includes('Z') ? c(C.red,  '💀 zombie')
                    : c(C.green, `✅ running (PID ${queuePid})`);
  const wdHealth    = wdAlive  ? c(C.green, `✅ PID ${wdPid}`)
                               : c(C.yellow, '⚠️  not running');
  const hbHealth    = hbAgeMin === null  ? c(C.gray, 'no heartbeat')
                    : hbHealthy          ? c(C.green, `${hbAgeMin.toFixed(1)}m ago`)
                    : c(C.red,             `${hbAgeMin.toFixed(1)}m ago (STALE)`);

  console.log(`  ${c(C.bold,'Mode:')}     ${modeLabel}`);
  console.log(`  ${c(C.bold,'Queue:')}    ${queueHealth}`);
  console.log(`  ${c(C.bold,'Watchdog:')} ${wdHealth}   ${c(C.dim,'heartbeat:')} ${hbHealth}`);
  console.log(`  ${c(C.bold,'Progress:')} ${c(C.green, String(queue.done.length))} done  │  ${c(C.yellow, queue.active.length ? '1' : '0')} active  │  ${c(C.dim, String(queue.pending.length))} pending  │  ${queue.total} total`);

  if (wdState?.restartCount) {
    const lastWhen = wdState.lastRestart ? ageStr(wdState.lastRestart) : 'never';
    console.log(`  ${c(C.bold,'Restarts:')} ${wdState.restartCount} total  (last: ${lastWhen} — ${wdState.lastRestartReason || 'n/a'})`);
  }

  // ── Active repo ──
  if (queue.active.length) {
    const r = queue.active[0];
    console.log('');
    console.log(line);
    console.log(c(C.bold + C.green, `  ▶  ACTIVE  —  ${r.name}`));
    console.log(`     ${c(C.dim, `ID:`)} ${r.id}   ${c(C.dim,'Priority:')} ${r.priority}   ${c(C.dim,'Complexity:')} ${r.complexity || 'n/a'}`);
    const fc = r.featureCount;
    console.log(`     ${c(C.bold,'Features:')} ${fc.passing}/${fc.total}  ${progressBar(fc.pct)}`);
    if (hb?.passingCount !== undefined) {
      console.log(`     ${c(C.dim,'Live passes:')} ${hb.passingCount}  ${c(C.dim,'(heartbeat ' + (hbAgeMin?.toFixed(1) || '?') + 'm ago)')}`);
    }
    if (r.focus) {
      const focus = r.focus.length > 100 ? r.focus.slice(0, 97) + '…' : r.focus;
      console.log(`     ${c(C.dim,'Focus:')} ${focus}`);
    }
    if (r.prdFile) console.log(`     ${c(C.dim,'PRD:')} ${path.basename(r.prdFile)}`);
    if (r.tags?.length) console.log(`     ${c(C.dim,'Tags:')} ${r.tags.join(', ')}`);
    if (status?.lastUpdated) console.log(`     ${c(C.dim,'Last update:')} ${ageStr(status.lastUpdated)}`);
  } else {
    console.log('');
    console.log(line);
    console.log(c(C.dim, '  (no active repo — queue may be between repos or idle)'));
  }

  // ── Pending queue ──
  if (!opts.activeOnly) {
    const showCount = opts.nextN || 8;
    const pending   = queue.pending.slice(0, showCount);

    if (pending.length) {
      console.log('');
      console.log(line);
      console.log(c(C.bold, `  NEXT IN QUEUE  (${queue.pending.length} pending)`));
      console.log('');

      pending.forEach((r, i) => {
        const fc     = r.featureCount;
        const prdTag = r.prdFile ? c(C.dim, ` [PRD]`) : '';
        const rank   = c(C.dim, `  ${String(i + 1).padStart(2)}. `);
        const name   = c(C.white, r.name.length > 38 ? r.name.slice(0, 35) + '…' : r.name.padEnd(38));
        const pri    = c(C.dim, `P${r.priority}`.padStart(5));
        const prog   = fc.total
          ? `${String(fc.passing).padStart(3)}/${String(fc.total).padEnd(3)} ${progressBar(fc.pct, 10)}`
          : c(C.dim, '  no features ');
        console.log(`${rank}${name} ${pri}  ${prog}${prdTag}`);
        if (r.focus && opts.verbose) {
          const focus = r.focus.length > 90 ? r.focus.slice(0, 87) + '…' : r.focus;
          console.log(`       ${c(C.dim, focus)}`);
        }
      });

      if (queue.pending.length > showCount) {
        console.log(c(C.dim, `       … and ${queue.pending.length - showCount} more`));
      }
    }
  }

  // ── Doctor diagnosis ──
  if (diag) {
    console.log('');
    console.log(line);
    const healIcon = diag.healed ? c(C.green, '✅ HEALED') : c(C.red, '❌ UNHEALED');
    console.log(c(C.bold, `  LAST DOCTOR DIAGNOSIS  ${healIcon}`));
    console.log(`  ${c(C.dim,'Root cause:')} ${diag.rootCause || 'n/a'}`);
    if (diag.actions?.length) diag.actions.forEach(a => console.log(`  ${c(C.dim,'→')} ${a}`));
    if (diag.ts) console.log(`  ${c(C.dim,'When:')} ${ageStr(diag.ts)}`);
  }

  // ── Recent log ──
  if (!opts.noLog && view.logLines?.length) {
    console.log('');
    console.log(line);
    console.log(c(C.bold, '  RECENT QUEUE LOG'));
    view.logLines.forEach(l => console.log(`  ${c(C.dim, l.slice(0, W - 2))}`));
  }

  console.log('');
  console.log(dline);
  console.log('');
}

// ── JSON output ──────────────────────────────────────────────────────────────
function renderJson(view) {
  if (!view) { console.log('{}'); return; }
  const out = {
    ts:       view.ts,
    mode:     view.mode.mode,
    health: {
      queuePid:  view.queuePid,
      procState: view.procState,
      wdPid:     view.wdPid,
      wdAlive:   view.wdAlive,
      heartbeatAgeMin: view.hbAgeMin ? +view.hbAgeMin.toFixed(1) : null,
      heartbeatHealthy: view.hbHealthy,
    },
    queue: {
      done:    view.queue.done.length,
      active:  view.queue.active.length,
      pending: view.queue.pending.length,
      total:   view.queue.total,
      currentRepo: view.hb?.currentRepo || null,
      passingCount: view.hb?.passingCount || 0,
    },
    active: view.queue.active.map(r => ({
      id: r.id, name: r.name, priority: r.priority,
      features: r.featureCount, focus: r.focus, tags: r.tags,
    })),
    next: view.queue.pending.slice(0, 10).map(r => ({
      id: r.id, name: r.name, priority: r.priority,
      features: r.featureCount, tags: r.tags,
    })),
    restarts: view.wdState?.restartCount || 0,
    lastRestart: view.wdState?.lastRestart || null,
    lastDiagnosis: view.diag || null,
  };
  console.log(JSON.stringify(out, null, 2));
}

// ── CLI entry ────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const cliArgs = process.argv.slice(2);
  const getArg  = (name) => {
    const idx = cliArgs.indexOf(name);
    return (idx !== -1 && idx + 1 < cliArgs.length) ? cliArgs[idx + 1] : null;
  };

  const isWatch   = cliArgs.includes('--watch');
  const isJson    = cliArgs.includes('--json');
  const isQueue   = cliArgs.includes('--queue');
  const isVerbose = cliArgs.includes('--verbose') || cliArgs.includes('-v');
  const nextN     = parseInt(getArg('--next') || '8', 10);

  const opts = { verbose: isVerbose, nextN, activeOnly: false, noLog: isJson };

  function runOnce() {
    if (!isJson) process.stdout.write('\x1b[2J\x1b[H'); // clear screen
    const view = buildQueueView();
    if (isJson) renderJson(view);
    else        render(view, opts);
  }

  runOnce();

  if (isWatch) {
    const interval = parseInt(getArg('--interval') || '30', 10);
    console.log(c(C.dim, `  Refreshing every ${interval}s — Ctrl+C to stop`));
    setInterval(runOnce, interval * 1000);
  }
}
