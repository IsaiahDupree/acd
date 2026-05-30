#!/usr/bin/env node
/**
 * Project Status Reporter
 * =======================
 * Scans every directory in /Users/isaiahdupree/Documents/Software/,
 * aggregates git status, feature progress, running ports, Vercel presence,
 * and writes a unified status report to:
 *   - data/metrics/project-status-report.json   (machine-readable, read by ACD MCP)
 *   - /tmp/project-status.log                    (human-readable table)
 *
 * Usage:
 *   node engine/project-status.js            # full scan
 *   node engine/project-status.js --json     # JSON to stdout
 *   node engine/project-status.js --short    # only changed/incomplete
 *   node engine/project-status.js --supabase # also write to Supabase
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { METRICS_DIR, featureFile, ENGINE_DIR } from './paths.js';

const SOFTWARE_ROOT = '/Users/isaiahdupree/Documents/Software';
const REPORT_FILE = process.env.ACD_STATUS_REPORT || path.join(METRICS_DIR, 'project-status-report.json');
const LOG_FILE = '/tmp/project-status.log';

const JSON_OUT   = process.argv.includes('--json');
const SHORT      = process.argv.includes('--short');
const SUPABASE   = process.argv.includes('--supabase');

// Load skip registry — targets explicitly excluded from ACD tracking
const SKIP_REGISTRY_FILE = path.join(METRICS_DIR, 'skip-registry.json');
const SKIP_REGISTRY = (() => {
  try {
    const data = JSON.parse(fs.readFileSync(SKIP_REGISTRY_FILE, 'utf-8'));
    const map = {};
    for (const entry of (data.targets || [])) {
      map[entry.name] = entry;
    }
    return map;
  } catch { return {}; }
})();

// Known port → project mappings
const PORT_MAP = {
  3100: 'ig-dm',
  3003: 'tw-dm',
  3102: 'tk-dm',
  3105: 'li-dm',
  3005: 'ig-comments',
  3006: 'tk-comments',
  3007: 'tw-comments',
  3004: 'threads',
  3106: 'market-research',
  3110: 'safari-controller',
  5555: 'mediaposter-backend',
  5563: 'media-vault-backend',
  8090: 'actp-worker',
  3434: 'linkedin-hub',
};

// Known Vercel project slugs
const VERCEL_PROJECTS = new Set([
  'adlite', 'actpdash', 'mediaposter-lite', 'genlite', 'metricslite',
  'hooklite', 'publishlite', 'researchlite', 'contentlite', 'agentlite',
  'blogcanvas', 'crmlite', 'upwork-bid-agent', 'softwarehub', 'portal28',
]);

function run(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, stdio: 'pipe', timeout: 5000 }).toString().trim();
  } catch { return null; }
}

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

function getGitInfo(dir) {
  if (!isGitRepo(dir)) return null;
  // Use Unix timestamp for reliable age grouping, plus human-readable age
  const log = run('git log -1 --format=%ct__SEP__%ar__SEP__%s__SEP__%H', dir);
  if (!log) return { age: 'no commits', ts: 0, subject: '', sha: '' };
  const [tsStr, age, subject, sha] = log.split('__SEP__');
  const ts = parseInt(tsStr) || 0;
  const branch = run('git branch --show-current', dir) || 'detached';
  const dirty = run('git status --porcelain', dir);
  return { age: age || 'unknown', ts, subject: (subject||'').slice(0,60), sha: (sha||'').slice(0,7), branch, dirty: dirty ? dirty.split('\n').length : 0 };
}

function getFeatureProgress(dir, projectId) {
  // Check multiple locations for feature lists. Prefer the canonical
  // data/features/<slug>.json; keep the legacy engine-relative paths as
  // fallbacks for any project that still ships its features there.
  const candidates = [
    path.join(dir, 'feature_list.json'),
    featureFile(projectId),
    path.join(ENGINE_DIR, `${projectId}-features.json`),
    path.join(ENGINE_DIR, 'features', `${projectId}.json`),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      try {
        const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
        const features = data.features || [];
        if (features.length === 0) continue;
        const passing = features.filter(f => f.passes === true).length;
        return { total: features.length, passing, pct: Math.round((passing / features.length) * 100), file: f };
      } catch {}
    }
  }
  return null;
}

function getProjectType(dir) {
  if (fs.existsSync(path.join(dir, 'requirements.txt')) || fs.existsSync(path.join(dir, 'pyproject.toml'))) return 'python';
  if (fs.existsSync(path.join(dir, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['next']) return 'next.js';
      if (deps['react']) return 'react';
      if (deps['express']) return 'express';
      if (deps['@modelcontextprotocol/sdk']) return 'mcp';
    } catch {}
    return 'node';
  }
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return 'rust';
  if (fs.existsSync(path.join(dir, 'go.mod'))) return 'go';
  return 'unknown';
}

function getVercelStatus(dir, name) {
  if (fs.existsSync(path.join(dir, '.vercel'))) return true;
  if (fs.existsSync(path.join(dir, 'vercel.json'))) return true;
  if (VERCEL_PROJECTS.has(name.toLowerCase())) return true;
  return false;
}

function checkPort(port) {
  const result = run(`lsof -i :${port} -sTCP:LISTEN -t`);
  return result ? parseInt(result.split('\n')[0]) : null;
}

function ageToGroup(age, ts) {
  // Prefer Unix timestamp — fully reliable
  if (ts) {
    const ageSec = Math.floor(Date.now() / 1000) - ts;
    if (ageSec < 7 * 24 * 3600)  return 'active';
    if (ageSec < 30 * 24 * 3600) return 'recent';
    return 'stale';
  }
  // Fallback: string parsing
  if (!age || age === 'no commits' || age === 'unknown') return 'stale';
  if (age.includes('hour') || age.includes('minute') || age.includes('second')) return 'active';
  if (age.match(/^[1-7] days?/)) return 'active';
  if (age.match(/^\d+ days?/) || age.match(/^\d+ weeks?/) || age.match(/^[12] months?/)) return 'recent';
  return 'stale';
}

async function main() {
  const entries = fs.readdirSync(SOFTWARE_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort();

  // Check which ports are live
  const livePorts = {};
  for (const [port, name] of Object.entries(PORT_MAP)) {
    const pid = checkPort(parseInt(port));
    if (pid) livePorts[parseInt(port)] = pid;
  }

  const projects = [];
  for (const name of entries) {
    const dir = path.join(SOFTWARE_ROOT, name);
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const git = getGitInfo(dir);
    const features = getFeatureProgress(dir, id);
    const type = getProjectType(dir);
    const vercel = getVercelStatus(dir, name);
    const group = git ? ageToGroup(git.age, git.ts) : 'no-git';

    // Is any known port associated with this project running?
    const runningPorts = Object.entries(PORT_MAP)
      .filter(([port, pname]) => pname.includes(id.slice(0,6)) || id.includes(pname.slice(0,6)))
      .map(([port]) => parseInt(port))
      .filter(p => livePorts[p]);

    const skipEntry = SKIP_REGISTRY[name];
    projects.push({
      id,
      name,
      dir,
      type,
      group: skipEntry ? 'skip' : group,
      git,
      features,
      vercel,
      runningPorts,
      complete: features ? features.passing === features.total : null,
      skip: skipEntry ? { reason: skipEntry.reason, category: skipEntry.category } : null,
    });
  }

  // Sort: active first, then recent, then stale, then no-git, then skip
  const groupOrder = { active: 0, recent: 1, stale: 2, 'no-git': 3, skip: 4 };
  projects.sort((a, b) => (groupOrder[a.group] ?? 3) - (groupOrder[b.group] ?? 3));

  const tracked = projects.filter(p => p.group !== 'skip');
  // Compute summary stats
  const summary = {
    generated_at: new Date().toISOString(),
    total: projects.length,
    tracked: tracked.length,
    skipped: projects.filter(p => p.group === 'skip').length,
    active: projects.filter(p => p.group === 'active').length,
    recent: projects.filter(p => p.group === 'recent').length,
    stale: projects.filter(p => p.group === 'stale').length,
    no_git: projects.filter(p => p.group === 'no-git').length,
    with_features: projects.filter(p => p.features).length,
    features_complete: projects.filter(p => p.complete === true).length,
    features_incomplete: projects.filter(p => p.features && !p.complete).length,
    untracked: tracked.filter(p => !p.features).length,
    vercel_deployed: projects.filter(p => p.vercel).length,
    live_ports: Object.keys(livePorts).length,
    live_port_map: livePorts,
  };

  const report = { summary, projects };

  // Write machine-readable report
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  // Build human-readable table
  const lines = [];
  lines.push(`TARGET STATUS REPORT — ${new Date().toLocaleString()} | target=whole project | feature=unit of work within a target`);
  lines.push(`${'='.repeat(100)}`);
  lines.push(`Total: ${summary.total} | Tracked: ${summary.tracked} | Skipped: ${summary.skipped} | Active: ${summary.active} | Recent: ${summary.recent} | Stale: ${summary.stale} | No-git: ${summary.no_git}`);
  lines.push(`Features: ${summary.features_complete} complete / ${summary.features_incomplete} incomplete / ${summary.untracked} untracked | Vercel: ${summary.vercel_deployed} | Live ports: ${summary.live_ports}`);
  lines.push('');

  let currentGroup = null;
  const display = SHORT
    ? projects.filter(p => p.group !== 'skip' && (p.group === 'active' || (p.features && !p.complete)))
    : projects.filter(p => p.group !== 'skip');

  for (const p of display) {
    if (p.group !== currentGroup) {
      currentGroup = p.group;
      const label = {
        active: 'ACTIVE (last 7 days)',
        recent: 'RECENT (last 30 days)',
        stale: 'STALE (>30 days)',
        'no-git': 'NO GIT REPO',
      }[p.group] || p.group.toUpperCase();
      lines.push(`\n--- ${label} ---`);
    }

    const feat = p.features ? `${p.features.passing}/${p.features.total} (${p.features.pct}%)` : '     —     ';
    const v = p.vercel ? '▲' : ' ';
    const age = p.git ? p.git.age.padEnd(18) : 'no commits        ';
    const subject = p.git ? p.git.subject.slice(0, 45).padEnd(45) : ''.padEnd(45);
    const dirty = (p.git && p.git.dirty > 0) ? `[${p.git.dirty}Δ]` : '    ';
    const ports = p.runningPorts.length ? `🟢:${p.runningPorts.join(',')}` : '';
    const status = p.complete === true ? '✅' : p.complete === false ? '🔄' : '  ';
    lines.push(`${status} ${v} ${p.name.padEnd(35)} ${p.type.padEnd(10)} ${age} ${feat.padEnd(15)} ${dirty} ${subject} ${ports}`);
  }

  const tableStr = lines.join('\n');
  fs.writeFileSync(LOG_FILE, tableStr);

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log(tableStr);
  }

  // Optionally write to Supabase
  if (SUPABASE) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = process.env.SUPABASE_URL || 'https://ivhfuhxorppptyuofbgq.supabase.co';
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      if (key) {
        const db = createClient(url, key);
        await db.from('project_status_snapshots').insert({
          snapshot_at: new Date().toISOString(),
          summary,
          projects: projects.map(p => ({
            id: p.id, name: p.name, type: p.type, group: p.group,
            last_commit: p.git?.age, last_subject: p.git?.subject,
            feature_total: p.features?.total, feature_passing: p.features?.passing,
            feature_pct: p.features?.pct, complete: p.complete, vercel: p.vercel,
          })),
        });
        console.log('\n[project-status] Saved snapshot to Supabase project_status_snapshots');
      }
    } catch (e) {
      console.error('[project-status] Supabase write failed:', e.message);
    }
  }

  console.log(`\n[project-status] Report saved to ${REPORT_FILE}`);
  return report;
}

main().catch(err => {
  console.error('[project-status] ERROR:', err.message);
  process.exit(1);
});
