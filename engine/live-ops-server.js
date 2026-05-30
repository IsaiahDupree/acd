#!/usr/bin/env node
/**
 * Live Ops Dashboard Server
 * =========================
 * Polsia-style real-time web dashboard for the full ACD ecosystem.
 *
 * Port: 3456  (env: LIVE_OPS_PORT)
 * Routes:
 *   GET /                    → dashboard HTML
 *   GET /api/health          → { ok: true }
 *   GET /api/status          → JSON snapshot (Safari services, daemons, DM counts, queues, bridge)
 *   GET /api/stream/activity → SSE live activity feed (orchestrator-log + daemon logs)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { handleObsRequest } from './observability-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const H = __dirname;
const PORT = parseInt(process.env.LIVE_OPS_PORT || '3456', 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(fp, fb = null) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return fb; }
}

async function httpGet(url, ms = 2500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

function pgrep(pattern) {
  try {
    return execSync(`pgrep -f "${pattern}"`, { encoding: 'utf-8', stdio: ['ignore','pipe','ignore'] })
      .trim().split('\n').map(Number).filter(Boolean);
  } catch { return []; }
}

function todayDate() { return new Date().toISOString().slice(0, 10); }

// ── Data collectors (mirrors system-status.js) ────────────────────────────────

const SAFARI_SERVICES = [
  { name: 'IG DM',       port: 3100 },
  { name: 'TW DM',       port: 3003 },
  { name: 'TK DM',       port: 3102 },
  { name: 'LI DM',       port: 3105 },
  { name: 'Threads',     port: 3004 },
  { name: 'IG Comments', port: 3005 },
  { name: 'TK Comments', port: 3006 },
  { name: 'TW Comments', port: 3007 },
  { name: 'Market Res',  port: 3106 },
];

const DAEMONS = [
  { name: 'cloud-bridge',           pattern: 'cloud-bridge.js' },
  { name: 'cloud-orchestrator',     pattern: 'cloud-orchestrator.js' },
  { name: 'browser-session-daemon', pattern: 'browser-session-daemon.js' },
  { name: 'linkedin-daemon',        pattern: 'linkedin-daemon.js' },
  { name: 'linkedin-engagement',    pattern: 'linkedin-engagement-daemon.js' },
  { name: 'linkedin-followup',      pattern: 'linkedin-followup-engine.js' },
  { name: 'dm-outreach',            pattern: 'dm-outreach-daemon.js' },
  { name: 'prospect-pipeline',      pattern: 'prospect-pipeline.js' },
  { name: 'twitter-dm-sweep',       pattern: 'twitter-dm-sweep.js' },
  { name: 'instagram-dm-sweep',     pattern: 'instagram-dm-sweep.js' },
  { name: 'tiktok-dm-sweep',        pattern: 'tiktok-dm-sweep.js' },
  { name: 'tw-comment-sweep',       pattern: 'twitter-comment-sweep.js' },
  { name: 'ig-comment-sweep',       pattern: 'instagram-comment-sweep.js' },
  { name: 'tk-comment-sweep',       pattern: 'tiktok-comment-sweep.js' },
  { name: 'th-comment-sweep',       pattern: 'threads-comment-sweep.js' },
  { name: 'dm-crm-sync',            pattern: 'dm-crm-sync.js' },
  { name: 'dm-followup-engine',     pattern: 'dm-followup-engine.js' },
  { name: 'telegram-bot',           pattern: 'telegram-bot.js' },
  { name: 'doctor-daemon',          pattern: 'doctor-daemon.js' },
];

async function collectStatus() {
  const [services] = await Promise.all([
    Promise.all(SAFARI_SERVICES.map(async svc => {
      const data = await httpGet(`http://localhost:${svc.port}/health`);
      return { ...svc, up: data !== null };
    })),
  ]);

  const daemons = DAEMONS.map(d => {
    const pids = pgrep(d.pattern);
    return { name: d.name, running: pids.length > 0, pid: pids[0] || null };
  });

  const today = todayDate();
  const outreachState = readJson(path.join(H, 'dm-outreach-state.json'), {});
  const dc = outreachState.dailyCounts || {};
  const dmCounts = {
    ig: dc.ig?.date === today ? dc.ig.sent : 0,
    tw: dc.tw?.date === today ? dc.tw.sent : 0,
    tt: dc.tt?.date === today ? dc.tt.sent : 0,
    limits: { ig: 10, tw: 15, tt: 8 },
    totalSent: outreachState.totalSent || 0,
    totalFailed: outreachState.totalFailed || 0,
  };

  const queueFiles = { ig: 'prospect-ig-queue.json', tw: 'prospect-tw-queue.json', tt: 'prospect-tt-queue.json' };
  const queues = {};
  for (const [p, file] of Object.entries(queueFiles)) {
    const q = readJson(path.join(H, file), []);
    queues[p] = {
      total: q.length,
      pending: q.filter(i => i.status === 'pending_approval' || i.status === 'approved').length,
      sent: q.filter(i => i.status === 'sent').length,
    };
  }
  const liQ = readJson(path.join(H, 'linkedin-dm-queue.json'), []);
  queues.li = {
    total: liQ.length,
    pending: liQ.filter(i => i.status === 'pending_approval').length,
    sent: liQ.filter(i => i.status === 'sent').length,
  };

  const bridge = readJson(path.join(H, 'cloud-bridge-state.json'), {});

  const errors = [];
  const logFiles = ['logs/dm-outreach.log', 'logs/cloud-bridge.log', 'logs/linkedin-daemon.log'];
  for (const lf of logFiles) {
    try {
      const lines = fs.readFileSync(path.join(H, lf), 'utf-8').split('\n').filter(Boolean);
      const errs = lines.slice(-200).filter(l => /error|Error|FAIL|failed|Fatal/i.test(l) && !/non-fatal/i.test(l));
      if (errs.length) errors.push({ file: lf, last: errs[errs.length - 1].slice(0, 150) });
    } catch { /* no log */ }
  }

  // ACD queue stats from harness-status files
  const acdProjects = [];
  try {
    const statusFiles = fs.readdirSync(path.join(H, '..'))
      .filter(f => f.startsWith('harness-status-') && f.endsWith('.json'));
    for (const sf of statusFiles) {
      const s = readJson(path.join(H, '..', sf), null);
      if (s) acdProjects.push({ slug: sf.replace('harness-status-', '').replace('.json', ''), ...s });
    }
  } catch { /* no status files */ }

  return {
    ts: new Date().toISOString(),
    services,
    daemons,
    dmCounts,
    queues,
    bridge,
    errors,
    acdProjects,
    uptime: process.uptime(),
  };
}

// ── SSE activity stream ───────────────────────────────────────────────────────

const SSE_CLIENTS = new Set();

function classifyLine(raw) {
  try {
    const obj = JSON.parse(raw);
    // orchestrator-log format
    if (obj.action) {
      const type = obj.result?.error ? 'error'
        : obj.action === 'no_action' ? 'idle'
        : obj.action?.startsWith('dispatch') ? 'dispatch'
        : 'info';
      return {
        ts: obj.ts || new Date().toISOString(),
        type,
        source: 'orchestrator',
        message: obj.action,
        detail: obj.reason?.slice(0, 120) || '',
        extra: obj.revenue_impact,
      };
    }
    // daemon log JSON format
    if (obj.msg || obj.message) {
      const msg = obj.msg || obj.message;
      const type = /error|fail/i.test(msg) ? 'error'
        : /sent|success|ok|complete/i.test(msg) ? 'success'
        : /warn/i.test(msg) ? 'warning'
        : 'info';
      return { ts: obj.ts || new Date().toISOString(), type, source: obj.source || 'daemon', message: msg.slice(0, 120) };
    }
  } catch { /* not JSON */ }

  // Plain text line
  const type = /error|Error|FAIL|failed/i.test(raw) ? 'error'
    : /sent|success|ok|complete/i.test(raw) ? 'success'
    : /warn/i.test(raw) ? 'warning'
    : 'info';
  return {
    ts: new Date().toISOString(),
    type,
    source: 'log',
    message: raw.slice(0, 150),
  };
}

function broadcastEvent(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of SSE_CLIENTS) {
    try { client.write(data); } catch { SSE_CLIENTS.delete(client); }
  }
}

// Tail a file: send last N lines, then watch for new content
function tailFile(filePath, label, lastN = 50) {
  let size = 0;
  try { size = fs.statSync(filePath).size; } catch { return; }

  // Send historical lines
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean).slice(-lastN);
    for (const line of lines) {
      broadcastEvent({ ...classifyLine(line), source: label, _hist: true });
    }
  } catch { /* no file */ }

  // Watch for new content
  const watcher = fs.watch(filePath, (event) => {
    if (event !== 'change') return;
    try {
      const newSize = fs.statSync(filePath).size;
      if (newSize <= size) { size = newSize; return; }
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(newSize - size);
      fs.readSync(fd, buf, 0, buf.length, size);
      fs.closeSync(fd);
      size = newSize;
      const newLines = buf.toString('utf-8').split('\n').filter(Boolean);
      for (const line of newLines) {
        broadcastEvent({ ...classifyLine(line), source: label });
      }
    } catch { /* read error */ }
  });

  return watcher;
}

function startActivityWatchers() {
  const watchers = [];
  const orchLog = path.join(H, 'orchestrator-log.ndjson');
  if (fs.existsSync(orchLog)) watchers.push(tailFile(orchLog, 'orchestrator', 80));

  const logDir = path.join(H, 'logs');
  const logFiles = [
    'dm-outreach.log', 'cloud-bridge.log', 'linkedin-daemon.log',
    'prospect-pipeline.log', 'instagram-dm-sweep.log',
  ];
  for (const lf of logFiles) {
    const fp = path.join(logDir, lf);
    if (fs.existsSync(fp)) watchers.push(tailFile(fp, lf.replace('.log', ''), 20));
  }

  // Also watch ndjson log files in harness/
  const ndjsonFiles = [
    'dm-auto-sender-log.ndjson', 'prospect-pipeline-log.ndjson',
    'linkedin-connection-log.ndjson', 'cloud-bridge-log.ndjson',
  ];
  for (const nf of ndjsonFiles) {
    const fp = path.join(H, nf);
    if (fs.existsSync(fp)) watchers.push(tailFile(fp, nf.replace('-log.ndjson', ''), 20));
  }

  return watchers;
}

// ── Dashboard HTML ────────────────────────────────────────────────────────────

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ACD Live Ops</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #080c10;
    --surface: #0e1318;
    --card: #141a22;
    --border: #1e2a35;
    --text: #c9d4e0;
    --dim: #5a6b7a;
    --green: #22c55e;
    --red: #ef4444;
    --yellow: #f59e0b;
    --blue: #3b82f6;
    --cyan: #06b6d4;
    --purple: #a855f7;
    --orange: #f97316;
  }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 13px; }

  /* NAV */
  nav { display: flex; align-items: center; gap: 0; background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 16px; height: 44px; position: sticky; top: 0; z-index: 100; }
  .nav-logo { color: var(--cyan); font-weight: 700; font-size: 14px; margin-right: 24px; white-space: nowrap; }
  .nav-logo span { color: var(--dim); }
  .tab { padding: 0 16px; height: 44px; display: flex; align-items: center; cursor: pointer; color: var(--dim); border-bottom: 2px solid transparent; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; transition: color .15s, border-color .15s; user-select: none; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--cyan); border-bottom-color: var(--cyan); }
  .nav-status { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--dim); }
  .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .dot.green { background: var(--green); box-shadow: 0 0 6px var(--green); }
  .dot.red { background: var(--red); }
  .dot.yellow { background: var(--yellow); }

  /* LAYOUT */
  .page { display: none; padding: 16px; max-width: 1200px; margin: 0 auto; }
  .page.active { display: block; }

  /* CARDS */
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; margin-bottom: 14px; }
  .card-title { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); margin-bottom: 10px; }

  /* GRID */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  @media (max-width: 768px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

  /* LIVE FEED */
  #live-feed { height: calc(100vh - 120px); overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 10px; font-size: 12px; line-height: 1.6; scroll-behavior: smooth; }
  .feed-line { display: flex; gap: 10px; align-items: baseline; padding: 2px 4px; border-radius: 3px; animation: fadeIn .2s ease; }
  .feed-line:hover { background: rgba(255,255,255,.03); }
  .feed-line.error { color: var(--red); }
  .feed-line.success { color: var(--green); }
  .feed-line.dispatch { color: var(--blue); }
  .feed-line.warning { color: var(--yellow); }
  .feed-line.idle { color: var(--dim); }
  .feed-line.info { color: var(--text); }
  .feed-ts { color: var(--dim); font-size: 10px; white-space: nowrap; min-width: 64px; }
  .feed-source { color: var(--purple); font-size: 10px; min-width: 90px; }
  .feed-msg { flex: 1; word-break: break-word; }
  .feed-detail { color: var(--dim); font-size: 11px; }
  .feed-controls { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
  .feed-controls input { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 4px 8px; color: var(--text); font-family: inherit; font-size: 12px; width: 200px; outline: none; }
  .feed-controls input:focus { border-color: var(--cyan); }
  .btn { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 4px 10px; color: var(--dim); cursor: pointer; font-family: inherit; font-size: 11px; }
  .btn:hover { border-color: var(--cyan); color: var(--text); }
  .btn.active { border-color: var(--cyan); color: var(--cyan); }
  @keyframes fadeIn { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; } }

  /* SERVICE GRID */
  .svc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .svc-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--surface); border-radius: 4px; border: 1px solid var(--border); }
  .svc-name { flex: 1; color: var(--text); font-size: 12px; }
  .svc-port { color: var(--dim); font-size: 11px; }

  /* DAEMON TABLE */
  .daemon-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .daemon-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--surface); border-radius: 4px; border: 1px solid var(--border); }
  .daemon-name { flex: 1; font-size: 12px; }
  .daemon-pid { color: var(--dim); font-size: 10px; }

  /* PROGRESS BAR */
  .progress-row { margin-bottom: 10px; }
  .progress-label { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
  .progress-label span:last-child { color: var(--dim); }
  .progress-track { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 3px; transition: width .4s ease; }
  .progress-fill.green { background: var(--green); }
  .progress-fill.yellow { background: var(--yellow); }
  .progress-fill.red { background: var(--red); }

  /* QUEUE TABLE */
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; color: var(--dim); font-weight: 400; padding: 4px 10px; border-bottom: 1px solid var(--border); text-transform: uppercase; font-size: 10px; letter-spacing: .05em; }
  td { padding: 7px 10px; border-bottom: 1px solid rgba(30,42,53,.6); }
  tr:last-child td { border-bottom: none; }

  /* STAT BOXES */
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
  .stat-box { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; }
  .stat-value { font-size: 24px; font-weight: 700; color: var(--text); }
  .stat-label { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: .05em; margin-top: 2px; }

  /* ERRORS */
  .error-item { padding: 8px 10px; background: rgba(239,68,68,.05); border-left: 2px solid var(--red); border-radius: 0 4px 4px 0; margin-bottom: 6px; font-size: 12px; }
  .error-file { color: var(--dim); font-size: 10px; margin-bottom: 3px; }
  .error-msg { color: var(--red); word-break: break-all; }

  /* SSE status */
  .sse-status { font-size: 10px; color: var(--dim); margin-left: auto; }
  .connecting { color: var(--yellow); }
  .connected { color: var(--green); }
  .disconnected { color: var(--red); }

  /* ACD projects */
  .acd-item { padding: 10px; background: var(--surface); border-radius: 4px; border: 1px solid var(--border); margin-bottom: 6px; }
  .acd-slug { font-size: 12px; font-weight: 700; color: var(--cyan); }
  .acd-meta { font-size: 11px; color: var(--dim); margin-top: 3px; }

  /* Updated flash */
  .just-updated { animation: flash .5s ease; }
  @keyframes flash { 0% { opacity: .4; } 100% { opacity: 1; } }

  .tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; }
  .tag.green { background: rgba(34,197,94,.15); color: var(--green); }
  .tag.red { background: rgba(239,68,68,.15); color: var(--red); }
  .tag.yellow { background: rgba(245,158,11,.15); color: var(--yellow); }
  .tag.blue { background: rgba(59,130,246,.15); color: var(--blue); }
  .tag.dim { background: rgba(90,107,122,.15); color: var(--dim); }
</style>
</head>
<body>

<nav>
  <div class="nav-logo">ACD <span>Live Ops</span></div>
  <div class="tab active" onclick="showTab('live')">Live</div>
  <div class="tab" onclick="showTab('services')">Services</div>
  <div class="tab" onclick="showTab('agents')">Agents</div>
  <div class="tab" onclick="showTab('healing')">Healing</div>
  <div class="tab" onclick="showTab('metrics')">Metrics</div>
  <div class="nav-status">
    <span id="sse-indicator" class="sse-status connecting">● SSE connecting...</span>
    <span id="last-updated" style="font-size:10px;color:var(--dim)">—</span>
  </div>
</nav>

<!-- LIVE TAB -->
<div id="page-live" class="page active">
  <div class="feed-controls">
    <input id="feed-filter" type="text" placeholder="Filter activity..." oninput="filterFeed()" />
    <button class="btn" id="btn-pause" onclick="togglePause()">Pause</button>
    <button class="btn" onclick="clearFeed()">Clear</button>
    <button class="btn" id="btn-errors-only" onclick="toggleErrorsOnly()">Errors only</button>
    <span id="feed-count" style="color:var(--dim);font-size:11px;margin-left:4px">0 events</span>
  </div>
  <div id="live-feed"></div>
</div>

<!-- SERVICES TAB -->
<div id="page-services" class="page">
  <div class="card">
    <div class="card-title">Safari Services (9 ports)</div>
    <div class="svc-grid" id="svc-grid">
      <div class="dim">Loading...</div>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Daemons (<span id="daemon-count">?</span>/<span id="daemon-total">?</span> running)</div>
    <div class="daemon-grid" id="daemon-grid">
      <div class="dim">Loading...</div>
    </div>
  </div>
</div>

<!-- AGENTS TAB -->
<div id="page-agents" class="page">
  <div class="grid-2">
    <div class="card">
      <div class="card-title">DM Outreach Today</div>
      <div id="dm-bars">Loading...</div>
    </div>
    <div class="card">
      <div class="card-title">Prospect Queues</div>
      <table>
        <thead><tr><th>Platform</th><th>Pending</th><th>Sent</th><th>Total</th></tr></thead>
        <tbody id="queue-table">
          <tr><td colspan="4" style="color:var(--dim)">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  <div class="card">
    <div class="card-title">ACD Projects</div>
    <div id="acd-projects">Loading...</div>
  </div>
</div>

<!-- HEALING TAB (SH-010) -->
<div id="page-healing" class="page">
  <div class="stat-grid" id="healing-stat-grid"></div>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">Service Health Grid</div>
      <div class="svc-grid" id="healing-svc-grid"><div class="dim">Loading...</div></div>
    </div>
    <div class="card">
      <div class="card-title">System Components</div>
      <div id="healing-components"><div class="dim">Loading...</div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Recent Auto-Heals</div>
    <table>
      <thead><tr><th>Time</th><th>Service</th><th>Result</th><th>Detail</th></tr></thead>
      <tbody id="healing-table"><tr><td colspan="4" style="color:var(--dim)">Loading...</td></tr></tbody>
    </table>
  </div>
</div>

<!-- METRICS TAB -->
<div id="page-metrics" class="page">
  <div class="stat-grid" id="stat-grid">
    <!-- filled by JS -->
  </div>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">Cloud Bridge</div>
      <div id="bridge-stats">Loading...</div>
    </div>
    <div class="card">
      <div class="card-title">Recent Errors</div>
      <div id="error-list">Loading...</div>
    </div>
  </div>
</div>

<script>
// ── State ──────────────────────────────────────────────────────────────────────
let statusData = null;
let paused = false;
let errorsOnly = false;
let filterText = '';
let allEvents = [];
const MAX_EVENTS = 500;

// ── Tab navigation ─────────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('active', ['live','services','agents','healing','metrics','goals'][i] === name);
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (name === 'healing') fetchHealingData();
  if (name === 'goals') fetchGoalsData();
}

// ── SSE Live Feed ──────────────────────────────────────────────────────────────
const feed = document.getElementById('live-feed');
const sse = new EventSource('/api/stream/activity');

sse.onopen = () => {
  document.getElementById('sse-indicator').textContent = '● SSE connected';
  document.getElementById('sse-indicator').className = 'sse-status connected';
};
sse.onerror = () => {
  document.getElementById('sse-indicator').textContent = '● SSE disconnected';
  document.getElementById('sse-indicator').className = 'sse-status disconnected';
};

sse.onmessage = (e) => {
  const ev = JSON.parse(e.data);
  allEvents.push(ev);
  if (allEvents.length > MAX_EVENTS) allEvents.shift();
  if (!paused) appendLine(ev);
  updateFeedCount();
};

function appendLine(ev) {
  if (paused) return;
  if (errorsOnly && ev.type !== 'error') return;
  if (filterText && !matchesFilter(ev, filterText)) return;

  const t = new Date(ev.ts);
  const timeStr = t.toLocaleTimeString('en-US', { hour12: false });
  const line = document.createElement('div');
  line.className = 'feed-line ' + (ev.type || 'info');
  line.dataset.type = ev.type || 'info';
  line.dataset.source = ev.source || '';
  line.dataset.msg = (ev.message || '') + ' ' + (ev.detail || '');

  const detail = ev.detail ? '<span class="feed-detail"> — ' + escHtml(ev.detail) + '</span>' : '';
  const extra = ev.extra ? '<span class="tag ' + tagColor(ev.extra) + '">' + escHtml(ev.extra) + '</span>' : '';

  line.innerHTML =
    '<span class="feed-ts">' + timeStr + '</span>' +
    '<span class="feed-source">' + escHtml(ev.source || '') + '</span>' +
    '<span class="feed-msg">' + escHtml(ev.message || '') + detail + '</span>' +
    (extra ? ' ' + extra : '');

  if (ev._hist) line.style.opacity = '0.6';

  feed.appendChild(line);
  feed.scrollTop = feed.scrollHeight;

  // Trim DOM
  while (feed.children.length > MAX_EVENTS) feed.removeChild(feed.firstChild);
}

function tagColor(v) {
  if (v === 'high') return 'green';
  if (v === 'low') return 'dim';
  return 'blue';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function matchesFilter(ev, text) {
  const t = text.toLowerCase();
  return (ev.message || '').toLowerCase().includes(t) ||
         (ev.source || '').toLowerCase().includes(t) ||
         (ev.detail || '').toLowerCase().includes(t);
}

function filterFeed() {
  filterText = document.getElementById('feed-filter').value;
  rebuildFeed();
}

function rebuildFeed() {
  feed.innerHTML = '';
  for (const ev of allEvents) appendLine(ev);
}

function togglePause() {
  paused = !paused;
  const btn = document.getElementById('btn-pause');
  btn.textContent = paused ? 'Resume' : 'Pause';
  btn.classList.toggle('active', paused);
  if (!paused) rebuildFeed();
}

function toggleErrorsOnly() {
  errorsOnly = !errorsOnly;
  document.getElementById('btn-errors-only').classList.toggle('active', errorsOnly);
  rebuildFeed();
}

function clearFeed() {
  allEvents = [];
  feed.innerHTML = '';
  updateFeedCount();
}

function updateFeedCount() {
  document.getElementById('feed-count').textContent = allEvents.length + ' events';
}

// ── Status polling ─────────────────────────────────────────────────────────────
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    statusData = await res.json();
    renderAll();
    document.getElementById('last-updated').textContent =
      'Updated ' + new Date().toLocaleTimeString('en-US', { hour12: false });
  } catch (e) { console.warn('status fetch failed', e); }
}

function renderAll() {
  if (!statusData) return;
  renderServices();
  renderDaemons();
  renderDM();
  renderQueues();
  renderACD();
  renderMetrics();
}

function renderServices() {
  const grid = document.getElementById('svc-grid');
  if (!statusData.services) return;
  grid.innerHTML = statusData.services.map(s => {
    const color = s.up ? 'var(--green)' : 'var(--red)';
    return \`<div class="svc-item">
      <span class="dot" style="background:\${color};\${s.up?'box-shadow:0 0 5px '+color:''}"></span>
      <span class="svc-name">\${s.name}</span>
      <span class="svc-port">:\${s.port}</span>
    </div>\`;
  }).join('');
}

function renderDaemons() {
  const grid = document.getElementById('daemon-grid');
  const daemons = statusData.daemons || [];
  const running = daemons.filter(d => d.running).length;
  document.getElementById('daemon-count').textContent = running;
  document.getElementById('daemon-total').textContent = daemons.length;
  grid.innerHTML = daemons.map(d => {
    const color = d.running ? 'var(--green)' : 'var(--dim)';
    return \`<div class="daemon-item">
      <span class="dot" style="background:\${color}"></span>
      <span class="daemon-name">\${d.name}</span>
      <span class="daemon-pid">\${d.running ? '[' + d.pid + ']' : ''}</span>
    </div>\`;
  }).join('');
}

function renderDM() {
  const dm = statusData.dmCounts;
  if (!dm) return;
  const bars = [
    { label: 'Instagram', val: dm.ig, max: dm.limits.ig },
    { label: 'Twitter',   val: dm.tw, max: dm.limits.tw },
    { label: 'TikTok',    val: dm.tt, max: dm.limits.tt },
  ];
  document.getElementById('dm-bars').innerHTML = bars.map(b => {
    const pct = Math.round(100 * b.val / Math.max(b.max, 1));
    const cls = pct >= 80 ? 'green' : pct >= 40 ? 'yellow' : 'red';
    return \`<div class="progress-row">
      <div class="progress-label"><span>\${b.label}</span><span>\${b.val}/\${b.max} (\${pct}%)</span></div>
      <div class="progress-track"><div class="progress-fill \${cls}" style="width:\${pct}%"></div></div>
    </div>\`;
  }).join('') + \`<div style="color:var(--dim);font-size:11px;margin-top:8px">
    All-time: \${dm.totalSent} sent · \${dm.totalFailed} failed
  </div>\`;
}

function renderQueues() {
  const q = statusData.queues || {};
  const labels = { ig: 'Instagram', tw: 'Twitter', tt: 'TikTok', li: 'LinkedIn' };
  document.getElementById('queue-table').innerHTML = Object.entries(q).map(([p, v]) => {
    const pendingTag = v.pending > 0 ? \`<span class="tag yellow">\${v.pending}</span>\` : v.pending;
    return \`<tr>
      <td>\${labels[p] || p}</td>
      <td>\${pendingTag}</td>
      <td>\${v.sent}</td>
      <td>\${v.total}</td>
    </tr>\`;
  }).join('');
}

function renderACD() {
  const projects = statusData.acdProjects || [];
  const el = document.getElementById('acd-projects');
  if (!projects.length) {
    el.innerHTML = '<span style="color:var(--dim);font-size:12px">No active ACD projects found</span>';
    return;
  }
  el.innerHTML = projects.map(p => {
    const statusTag = p.status === 'running'
      ? '<span class="tag green">running</span>'
      : p.status === 'completed'
      ? '<span class="tag blue">done</span>'
      : '<span class="tag dim">' + (p.status || '?') + '</span>';
    return \`<div class="acd-item">
      <div class="acd-slug">\${p.slug} \${statusTag}</div>
      <div class="acd-meta">\${p.lastActivity || p.startedAt || ''}</div>
    </div>\`;
  }).join('');
}

function renderMetrics() {
  const services = statusData.services || [];
  const daemons = statusData.daemons || [];
  const dm = statusData.dmCounts || {};
  const bridge = statusData.bridge || {};
  const upSvcs = services.filter(s => s.up).length;
  const upDaemons = daemons.filter(d => d.running).length;

  document.getElementById('stat-grid').innerHTML = [
    { label: 'Services Up', value: upSvcs + '/' + services.length, color: upSvcs === services.length ? 'var(--green)' : 'var(--yellow)' },
    { label: 'Daemons Running', value: upDaemons + '/' + daemons.length, color: upDaemons > 10 ? 'var(--green)' : 'var(--yellow)' },
    { label: 'DMs Sent Today', value: (dm.ig||0) + (dm.tw||0) + (dm.tt||0), color: 'var(--cyan)' },
    { label: 'Bridge Processed', value: bridge.totalProcessed || 0, color: 'var(--text)' },
  ].map(s => \`<div class="stat-box">
    <div class="stat-value" style="color:\${s.color}">\${s.value}</div>
    <div class="stat-label">\${s.label}</div>
  </div>\`).join('');

  // Bridge details
  document.getElementById('bridge-stats').innerHTML = \`
    <table>
      <tr><td style="color:var(--dim)">Processed</td><td>\${bridge.totalProcessed || 0}</td></tr>
      <tr><td style="color:var(--dim)">Failed</td><td>\${bridge.totalFailed || 0}</td></tr>
      <tr><td style="color:var(--dim)">Rate-limited</td><td>\${bridge.totalRateLimited || 0}</td></tr>
      <tr><td style="color:var(--dim)">Last poll</td><td>\${bridge.lastPoll ? new Date(bridge.lastPoll).toLocaleTimeString() : '—'}</td></tr>
    </table>
  \`;

  // Errors
  const errors = statusData.errors || [];
  const errEl = document.getElementById('error-list');
  if (!errors.length) {
    errEl.innerHTML = '<span style="color:var(--green);font-size:12px">No recent errors</span>';
  } else {
    errEl.innerHTML = errors.map(e => \`<div class="error-item">
      <div class="error-file">\${e.file}</div>
      <div class="error-msg">\${escHtml(e.last)}</div>
    </div>\`).join('');
  }
}

// ── Self-Healing Panel (SH-010) ──────────────────────────────────────────────
async function fetchHealingData() {
  try {
    const res = await fetch('/api/healing/status');
    const d = await res.json();

    // Stat boxes
    document.getElementById('healing-stat-grid').innerHTML = [
      { label: 'Monitored', value: d.monitored_services?.length || 0, color: 'var(--cyan)' },
      { label: 'Total Heals', value: d.total_heals || 0, color: 'var(--blue)' },
      { label: 'Success Rate', value: d.heal_success_rate != null ? d.heal_success_rate + '%' : 'N/A', color: d.heal_success_rate >= 50 ? 'var(--green)' : 'var(--red)' },
      { label: 'Avg MTTR', value: (d.mttr_seconds || 0) + 's', color: 'var(--orange)' },
    ].map(s => \`<div class="stat-box"><div class="stat-value" style="color:\${s.color}">\${s.value}</div><div class="stat-label">\${s.label}</div></div>\`).join('');

    // Service grid
    const svcs = d.monitored_services || [];
    document.getElementById('healing-svc-grid').innerHTML = svcs.length ? svcs.map(s => \`
      <div class="svc-item">
        <span class="dot \${s.status === 'up' ? 'green' : s.status === 'down' ? 'red' : 'yellow'}"></span>
        <span class="svc-name">\${s.name}</span>
        <span class="svc-port">:\${s.port}</span>
        <span class="tag \${s.uptime_pct >= 95 ? 'green' : s.uptime_pct >= 50 ? 'yellow' : 'red'}">\${s.uptime_pct}%</span>
      </div>
    \`).join('') : '<span class="dim">No services monitored yet</span>';

    // Components
    document.getElementById('healing-components').innerHTML = \`
      <div class="daemon-grid">
        <div class="daemon-item">
          <span class="dot \${d.monitor_status === 'running' ? 'green' : 'red'}"></span>
          <span class="daemon-name">service-monitor</span>
          <span class="tag \${d.monitor_status === 'running' ? 'green' : 'red'}">\${d.monitor_status}</span>
        </div>
        <div class="daemon-item">
          <span class="dot \${d.bridge_status === 'running' ? 'green' : 'red'}"></span>
          <span class="daemon-name">overstory-bridge</span>
          <span class="tag \${d.bridge_status === 'running' ? 'green' : 'red'}">\${d.bridge_status}</span>
        </div>
        <div class="daemon-item">
          <span class="dot \${d.overstory_agents > 0 ? 'green' : 'yellow'}"></span>
          <span class="daemon-name">code-fixer agents</span>
          <span class="tag blue">\${d.overstory_agents} active</span>
        </div>
      </div>
    \`;

    // Recent heals table
    const heals = (d.recent_heals || []).reverse();
    if (heals.length) {
      document.getElementById('healing-table').innerHTML = heals.map(h => \`
        <tr>
          <td style="white-space:nowrap;color:var(--dim)">\${new Date(h.ts).toLocaleTimeString()}</td>
          <td>\${h.service}</td>
          <td><span class="tag \${h.success ? 'green' : 'red'}">\${h.success ? 'healed' : 'failed'}</span></td>
          <td style="color:var(--dim);font-size:11px">\${h.fix_description || (h.mttr_ms ? 'MTTR ' + Math.round(h.mttr_ms/1000) + 's' : '—')}</td>
        </tr>
      \`).join('');
    } else {
      document.getElementById('healing-table').innerHTML = '<tr><td colspan="4" style="color:var(--dim)">No heal events yet</td></tr>';
    }
  } catch (e) {
    console.error('Failed to fetch healing data:', e);
  }
}


// ── Goals Tab (IL-011) ────────────────────────────────────────────────────────
async function fetchGoalsData() {
  try {
    const [statusRes, logRes, pendingRes] = await Promise.all([
      fetch('/api/improvement/status'),
      fetch('/api/improvement/log'),
      fetch('/api/improvement/pending'),
    ]);

    const status = await statusRes.json();
    const log = await logRes.json();
    const pending = await pendingRes.json();

    renderGoals(status, log, pending);
  } catch (e) {
    console.error('Failed to fetch goals data:', e);
  }
}

function renderGoals(status, log, pending) {
  const lastCycle = status.lastCycle || {};
  const kpis = lastCycle.metrics_snapshot || {};
  const entries = log.entries || [];
  const pendingItems = pending.pending || [];

  const revenueGap = kpis.revenue_gap || 0;
  document.getElementById('revenue-gap').textContent = '$' + Math.round(revenueGap);
  document.getElementById('revenue-gap').style.color = revenueGap > 3000 ? 'var(--red)' : revenueGap > 1000 ? 'var(--yellow)' : 'var(--green)';

  const dmsSent = kpis.dms_sent || 0;
  const dmTarget = Math.round((kpis.targets?.dm_sends_weekly || 50) / 7);
  const dmPct = dmTarget > 0 ? Math.round((dmsSent / dmTarget) * 100) : 0;
  document.getElementById('dm-progress').textContent = dmPct + '%';
  document.getElementById('dm-progress').style.color = dmPct >= 80 ? 'var(--green)' : dmPct >= 40 ? 'var(--yellow)' : 'var(--red)';

  const upworkSub = kpis.upwork_submitted || 0;
  const upworkTarget = Math.round((kpis.targets?.upwork_proposals_weekly || 5) / 7);
  const upworkPct = upworkTarget > 0 ? Math.round((upworkSub / upworkTarget) * 100) : 0;
  document.getElementById('upwork-progress').textContent = upworkPct + '%';

  document.getElementById('crm-contacts').textContent = kpis.state?.linkedin_total_prospects || 0;

  const kpiRows = [
    { metric: 'DMs Sent Today', current: dmsSent, target: dmTarget, status: dmsSent >= dmTarget ? 'green' : 'red' },
    { metric: 'Upwork Proposals', current: upworkSub, target: upworkTarget, status: upworkSub >= upworkTarget ? 'green' : 'red' },
    { metric: 'LinkedIn Connections', current: kpis.connections_today || 0, target: 5, status: (kpis.connections_today || 0) >= 5 ? 'green' : 'red' },
    { metric: 'Reply Rate', current: (kpis.reply_rate || 0).toFixed(1) + '%', target: '5%', status: (kpis.reply_rate || 0) >= 5 ? 'green' : 'red' },
  ];
  document.querySelector('#kpi-table tbody').innerHTML = kpiRows.map(r => \`
    <tr>
      <td>\${r.metric}</td>
      <td>\${r.current}</td>
      <td>\${r.target}</td>
      <td><span class="tag \${r.status}">\${r.status === 'green' ? '✓' : '✗'}</span></td>
    </tr>
  \`).join('');

  const sources = [
    { name: 'Upwork', target: 2500, color: 'var(--blue)' },
    { name: 'DM Clients', target: 1500, color: 'var(--cyan)' },
    { name: 'Content', target: 500, color: 'var(--green)' },
    { name: 'Products', target: 500, color: 'var(--purple)' },
  ];
  document.getElementById('revenue-chart').innerHTML = sources.map(s => {
    const pct = (s.target / 5000) * 100;
    return \`
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;">
        <div style="width:100%;height:\${pct * 2}px;background:\${s.color};border-radius:4px 4px 0 0;"></div>
        <div style="color:var(--dim);font-size:10px;margin-top:6px;">\${s.name}</div>
        <div style="color:var(--text);font-size:11px;font-weight:700;">$\${s.target}</div>
      </div>
    \`;
  }).join('');

  const autoEntries = entries.filter(e => e.auto_applied === true).slice(-10).reverse();
  if (autoEntries.length) {
    document.getElementById('adjustments-table').innerHTML = autoEntries.map(e => \`
      <tr>
        <td style="color:var(--dim);font-size:11px;white-space:nowrap;">\${new Date(e.ts).toLocaleTimeString()}</td>
        <td><code style="font-size:11px;">\${e.action_taken || '—'}</code></td>
        <td><span class="tag \${e.confidence >= 0.9 ? 'green' : 'yellow'}">\${Math.round(e.confidence * 100)}%</span></td>
        <td style="color:var(--dim);font-size:11px;">\${typeof e.outcome === 'object' ? JSON.stringify(e.outcome).slice(0, 50) : e.outcome}</td>
      </tr>
    \`).join('');
  } else {
    document.getElementById('adjustments-table').innerHTML = '<tr><td colspan="4" style="color:var(--dim)">No auto-adjustments yet</td></tr>';
  }

  if (pendingItems.length) {
    document.getElementById('pending-approvals').innerHTML = pendingItems.map(p => \`
      <div class="acd-item" style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:700;color:var(--text);">\${p.action}</div>
          <div style="font-size:11px;color:var(--dim);margin-top:2px;">\${p.reasoning}</div>
          <div style="font-size:10px;color:var(--dim);margin-top:2px;">Confidence: \${Math.round(p.confidence * 100)}%</div>
        </div>
        <button class="btn" style="background:var(--green);border-color:var(--green);color:white;" onclick="approveImprovement('\${p.id}')">✓ Approve</button>
        <button class="btn" onclick="skipImprovement('\${p.id}')">Skip</button>
      </div>
    \`).join('');
  } else {
    document.getElementById('pending-approvals').innerHTML = '<span style="color:var(--dim);font-size:12px;">No pending approvals</span>';
  }

  document.getElementById('loop-running').textContent = status.running ? 'RUNNING' : 'STOPPED';
  document.getElementById('loop-running').style.color = status.running ? 'var(--green)' : 'var(--red)';
}

async function runImprovementCycle() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳ Running...';
  try {
    const res = await fetch('/api/improvement/run', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      alert('Cycle complete! Check the adjustments table for results.');
      fetchGoalsData();
    } else {
      alert('Cycle failed: ' + (result.error || 'unknown error'));
    }
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Run Cycle Now';
  }
}

async function approveImprovement(id) {
  try {
    const res = await fetch('/api/improvement/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const result = await res.json();
    if (result.success) {
      alert('Approved and executed!');
      fetchGoalsData();
    } else {
      alert('Failed: ' + (result.error || 'unknown error'));
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

function skipImprovement(id) {
  alert('Skip not implemented yet - approval required for now');
}

// ── Boot ───────────────────────────────────────────────────────────────────────
fetchStatus();
setInterval(fetchStatus, 15000);
</script>
</body>
</html>`;

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(DASHBOARD_HTML);
    return;
  }

  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    return;
  }

  if (pathname === '/api/status') {
    try {
      const data = await collectStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  // Self-healing status route (SH-008)
  if (pathname === '/api/healing/status') {
    try {
      const healingStats = readJson(path.join(H, 'healing-stats.json'), {
        total_attempts: 0, successes: 0, failures: 0, mttr_seconds: 0, recent_heals: [], by_service: {},
      });
      const serviceHealth = readJson(path.join(H, 'service-health.json'), { services: [] });
      const smPid = readJson(path.join(H, 'service-monitor.pid'), null);
      const obPid = readJson(path.join(H, 'overstory-bridge.pid'), null);

      const data = {
        monitored_services: (serviceHealth.services || []).map(s => ({
          port: s.port,
          name: s.name,
          status: s.status || 'unknown',
          uptime_pct: s.uptime_pct || 0,
          last_restart: s.last_restart || null,
        })),
        recent_heals: (healingStats.recent_heals || []).slice(-20),
        heal_success_rate: healingStats.total_attempts > 0
          ? Math.round((healingStats.successes / healingStats.total_attempts) * 100)
          : null,
        total_heals: healingStats.total_attempts,
        mttr_seconds: healingStats.mttr_seconds,
        bridge_status: obPid ? 'running' : 'stopped',
        monitor_status: smPid ? 'running' : 'stopped',
        overstory_agents: pgrep('code-fixer-agent').length,
        by_service: healingStats.by_service || {},
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  // Observability mesh routes (/api/obs/*)
  if (pathname.startsWith('/api/obs/')) {
    const handled = await handleObsRequest(req, res).catch(e => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    });
    if (handled !== null) return;
  }

  if (pathname === '/api/stream/activity') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    SSE_CLIENTS.add(res);
    res.write('retry: 3000\n\n');

    // Send a heartbeat ping every 30s
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
    }, 30_000);

    req.on('close', () => {
      SSE_CLIENTS.delete(res);
      clearInterval(heartbeat);
    });

    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[live-ops] Dashboard running at http://localhost:${PORT}`);
  console.log(`[live-ops] Status API: http://localhost:${PORT}/api/status`);
  console.log(`[live-ops] SSE stream: http://localhost:${PORT}/api/stream/activity`);
  startActivityWatchers();
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[live-ops] Port ${PORT} already in use. Kill existing process or set LIVE_OPS_PORT.`);
  } else {
    console.error('[live-ops] Server error:', e);
  }
  process.exit(1);
});
