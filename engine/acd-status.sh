#!/bin/bash
# acd-status.sh — Full ACD project status overview
# Usage:
#   ./acd-status.sh              # Full status all projects
#   ./acd-status.sh --pending    # Only pending projects
#   ./acd-status.sh --done       # Only completed projects
#   ./acd-status.sh --active     # Only active + next up
#   ./acd-status.sh --search foo # Search projects by name/id

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILTER="${1:-}"
SEARCH="${2:-}"

HARNESS_DIR="$HARNESS_DIR" FILTER="$FILTER" SEARCH="$SEARCH" node --input-type=module << 'JSEOF'
import fs from 'fs';
import path from 'path';

const HARNESS = process.env.HARNESS_DIR;
const FILTER  = process.env.FILTER || '';
const SEARCH  = process.env.SEARCH || '';

const queuePath  = path.join(HARNESS, 'repo-queue.json');
const statusPath = path.join(HARNESS, 'queue-status.json');
const hbPath     = path.join(HARNESS, 'watchdog-heartbeat.json');
const statePath  = path.join(HARNESS, 'watchdog-state.json');

const queue  = JSON.parse(fs.readFileSync(queuePath,  'utf-8'));
const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));

let hb = {};
try { hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8')); } catch {}
let ws = {};
try { ws = JSON.parse(fs.readFileSync(statePath, 'utf-8')); } catch {}

const completed = new Set(status.completedRepos || []);
const current   = status.currentRepo || '';

function getProgress(repo) {
  const fl = repo.featureList;
  if (!fl || !fs.existsSync(fl)) return { passing: 0, total: 0, pct: 0 };
  try {
    const d = JSON.parse(fs.readFileSync(fl, 'utf-8'));
    const features = d.features || [];
    const passing  = features.filter(f => f.passes).length;
    const total    = features.length;
    return { passing, total, pct: total ? Math.round(passing / total * 100) : 0 };
  } catch { return { passing: 0, total: 0, pct: 0 }; }
}

const repos = queue.repos.filter(r => r.enabled !== false);

const active  = [];
const pending = [];
const done    = [];

for (const r of repos) {
  const rid  = r.id || r.slug || '?';
  const name = r.name || rid;
  const prog = getProgress(r);
  const pri  = r.priority || 0;
  const entry = { rid, name, pri, prog, r };

  if (SEARCH && !name.toLowerCase().includes(SEARCH.toLowerCase()) &&
      !rid.toLowerCase().includes(SEARCH.toLowerCase())) continue;

  if (rid === current)           active.push(entry);
  else if (completed.has(rid))   done.push(entry);
  else                           pending.push(entry);
}

pending.sort((a, b) => (a.pri || 999) - (b.pri || 999));
done.sort((a, b) => (b.pri || 0) - (a.pri || 0));

const hbAge = hb.ts ? ((Date.now() - new Date(hb.ts).getTime()) / 60000).toFixed(1) : '?';
const qPid  = ws.queuePid || '?';

// ── Header ──
console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                    ACD PROJECT STATUS                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`  Queue PID:   ${qPid}    Heartbeat: ${hbAge} min ago    Restarts: ${ws.restartCount || 0}`);
console.log(`  Done: ${done.length}  Active: ${active.length}  Pending: ${pending.length}  Total: ${repos.length}`);
console.log('');

// ── Active ──
if (!FILTER || FILTER === '--active') {
  console.log('▶  ACTIVE');
  if (active.length === 0) {
    console.log('   (none)');
  } else {
    for (const { rid, name, prog } of active) {
      const bar = prog.total ? `${prog.passing}/${prog.total} (${prog.pct}%)` : 'initializing...';
      console.log(`   ▶ ${name.substring(0, 55).padEnd(55)} ${bar}`);
    }
  }
  console.log('');
}

// ── Pending ──
if (!FILTER || FILTER === '--pending' || FILTER === '--active') {
  const label = FILTER === '--active' ? 'NEXT UP (top 15)' : `PENDING (${pending.length})`;
  console.log(`⏳  ${label}`);
  const limit = FILTER === '--active' ? 15 : pending.length;
  for (const { rid, name, prog, pri } of pending.slice(0, limit)) {
    const bar = prog.total ? `${prog.passing}/${prog.total}` : 'queued';
    console.log(`   [${String(pri).padStart(5)}] ${name.substring(0, 50).padEnd(50)} ${bar}`);
  }
  if (FILTER !== '--active' && pending.length > limit) {
    console.log(`   ... and ${pending.length - limit} more`);
  }
  console.log('');
}

// ── Done ──
if (!FILTER || FILTER === '--done') {
  console.log(`✅  DONE (${done.length})`);
  const limit = FILTER === '--done' ? done.length : 20;
  for (const { name, prog, pri } of done.slice(0, limit)) {
    const bar = prog.total ? `${prog.passing}/${prog.total} (${prog.pct}%)` : '✓';
    console.log(`   [${String(pri).padStart(5)}] ${name.substring(0, 50).padEnd(50)} ${bar}`);
  }
  if (done.length > limit && !FILTER) console.log(`   ... and ${done.length - limit} more completed`);
  console.log('');
}

JSEOF
