#!/usr/bin/env node

/**
 * ACD Queue State
 * ===============
 * Reads harness state files and returns structured queue + topology view.
 * Shows which agents are running/queued/completed and whether the topology
 * is parallel, series, or idle.
 */

import fs from 'fs';
import path from 'path';
import { ACD_ROOT, QUEUE_FILE, featureFile } from './paths.js';

const DASHBOARD_ROOT = ACD_ROOT;

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

/**
 * Resolve a feature-list path for a repo. Prefers the explicit `featureList`
 * field when it exists on disk; otherwise falls back to the canonical
 * data/features/<slug>.json location (FEATURES_DIR via featureFile).
 */
function resolveFeatureListPath(featureListPath, slug) {
  if (featureListPath && fs.existsSync(featureListPath)) return featureListPath;
  if (slug) {
    const canonical = featureFile(slug);
    if (fs.existsSync(canonical)) return canonical;
  }
  return featureListPath;
}

function getFeatureStats(featureListPath, slug) {
  const resolved = resolveFeatureListPath(featureListPath, slug);
  if (!resolved || !fs.existsSync(resolved)) {
    return { total: 0, passing: 0, pct: 0 };
  }
  const data = readJson(resolved, { features: [] });
  const features = data.features || [];
  const total = features.length;
  const passing = features.filter(f => f.passes === true).length;
  const pct = total > 0 ? +((passing / total) * 100).toFixed(1) : 0;
  return { total, passing, pct };
}

function isPidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * Build structured queue state from all harness files.
 * @returns {{ running, queued, completed, topology, parallelCount, nextUp, asOf }}
 */
export function getQueueState() {
  // Read repo queue
  const repoQueue = readJson(QUEUE_FILE, { repos: [] });
  const repos = (repoQueue.repos || []).filter(r => r.enabled !== false);

  // Read all harness-status-*.json from dashboard root
  const statusMap = new Map();
  try {
    const files = fs.readdirSync(DASHBOARD_ROOT).filter(
      f => f.startsWith('harness-status-') && f.endsWith('.json')
    );
    for (const f of files) {
      const d = readJson(path.join(DASHBOARD_ROOT, f));
      if (d?.projectId) statusMap.set(d.projectId, d);
    }
  } catch { /* ok */ }

  const running = [];
  const queued = [];
  const completed = [];

  for (const repo of repos) {
    const slug = repo.id;
    const featureStats = getFeatureStats(repo.featureList, slug);
    const status = statusMap.get(slug);

    // Completed: all features done
    if (featureStats.total > 0 && featureStats.passing === featureStats.total) {
      completed.push({
        slug,
        prd: repo.description || slug,
        features: featureStats,
        duration: status?.lastSessionDuration || null,
      });
      continue;
    }

    if (status) {
      const pidAlive = isPidAlive(status.pid);
      const ageMs = status.lastUpdated
        ? Date.now() - new Date(status.lastUpdated).getTime()
        : Infinity;
      const isRunning = status.status === 'running' && pidAlive;
      const stuckSince = ageMs > 30 * 60 * 1000 ? status.lastUpdated : null;

      if (isRunning) {
        running.push({
          slug,
          prd: repo.description || slug,
          features: featureStats,
          model: status.model,
          sessionNum: status.currentSession ?? status.sessionNumber ?? 1,
          stuckSince,
          lastUpdated: status.lastUpdated,
          pid: status.pid,
        });
        continue;
      }
    }

    // Not running, not complete → queued
    queued.push({
      slug,
      prd: repo.description || slug,
      features: { total: featureStats.total },
      position: queued.length + 1,
    });
  }

  const parallelCount = running.length;
  const topology =
    parallelCount > 1 ? 'parallel' :
    parallelCount === 1 ? 'series' :
    'idle';
  const nextUp = queued[0]?.slug || null;

  return {
    running,
    queued,
    completed,
    topology,
    parallelCount,
    nextUp,
    asOf: new Date().toISOString(),
  };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const state = getQueueState();
  console.log(JSON.stringify(state, null, 2));
}
