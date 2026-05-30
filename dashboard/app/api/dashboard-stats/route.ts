import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  DATA_DIR,
  LOGS_DIR,
  QUEUE_FILE,
  safeReadJson,
  repoSlug,
  resolveFeatureFile,
} from '../../../lib/acd-data';

function parseFeatureFile(absPath: string): { passes: number; total: number } {
  const data = safeReadJson(absPath);
  if (!data) return { passes: 0, total: 0 };
  const arr: any[] = Array.isArray(data) ? data : Array.isArray(data.features) ? data.features : [];
  const passes = arr.filter((f: any) => f.passes === true || f.status === 'passing').length;
  return { passes, total: arr.length };
}

function scanLogForSessions(logPath: string): { sessions: number; errors: number; inputTokens: number; outputTokens: number } {
  let sessions = 0, errors = 0, inputTokens = 0, outputTokens = 0;
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    // Session markers
    const sessionMatches = content.match(/Session \d+ (complete|start|finished|initialized)/gi) || [];
    sessions = Math.max(sessionMatches.length, (content.match(/claude.*session/gi) || []).length);
    // Error lines
    errors = (content.match(/\bERROR\b|\bFailed\b|\bException\b/g) || []).length;
    // Token usage lines like "input_tokens: 12345" or "Input tokens: 12,345"
    const inputMatch = content.match(/input_tokens[:\s]+([0-9,]+)/gi) || [];
    const outputMatch = content.match(/output_tokens[:\s]+([0-9,]+)/gi) || [];
    for (const m of inputMatch) {
      const n = parseInt(m.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n)) inputTokens += n;
    }
    for (const m of outputMatch) {
      const n = parseInt(m.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n)) outputTokens += n;
    }
  } catch { /* ignore */ }
  return { sessions, errors, inputTokens, outputTokens };
}

function getLogPaths(): string[] {
  const dirs = [
    path.join(LOGS_DIR, 'agent-prds'),
    LOGS_DIR,
  ];
  const results: string[] = [];
  for (const dir of dirs) {
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.log'));
      results.push(...files.map(f => path.join(dir, f)));
    } catch { /* ignore */ }
  }
  return results;
}

function getHarnessUptime(): string | null {
  try {
    const queueStatus = safeReadJson(path.join(DATA_DIR, 'queue-status.json'));
    if (queueStatus?.startedAt) {
      const started = new Date(queueStatus.startedAt);
      const uptimeMs = Date.now() - started.getTime();
      const hours = Math.floor(uptimeMs / 3600000);
      const mins = Math.floor((uptimeMs % 3600000) / 60000);
      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    }
  } catch { /* ignore */ }
  return null;
}

function countHarnessProcesses(): number {
  try {
    const out = execSync('pgrep -f "run-parallel.js|run-harness.js" 2>/dev/null || true', { encoding: 'utf8' });
    return out.trim().split('\n').filter(Boolean).length;
  } catch { return 0; }
}

export async function GET() {
  try {
    const queueFile = safeReadJson(QUEUE_FILE);
    const repos: any[] = queueFile?.repos || [];
    const queueStatus = safeReadJson(path.join(DATA_DIR, 'queue-status.json'));
    const parallelStatus = safeReadJson(path.join(DATA_DIR, 'parallel-status.json'));

    // ── Feature progress across all repos ──────────────────────────────────
    let totalFeatures = 0, totalPasses = 0;
    let reposComplete = 0, reposInProgress = 0, reposQueued = 0;
    const repoStats: Array<{ id: string; passes: number; total: number; percent: number }> = [];

    for (const r of repos) {
      if (r.enabled === false) continue;
      const slug = repoSlug(r);
      if (!slug) continue;
      const absPath = resolveFeatureFile(slug, r.featureList || '');
      const fp = parseFeatureFile(absPath);
      if (fp.total === 0) continue;
      totalFeatures += fp.total;
      totalPasses += fp.passes;
      const pct = fp.total > 0 ? Math.round((fp.passes / fp.total) * 100) : 0;
      if (pct === 100) reposComplete++;
      else if (fp.passes > 0) reposInProgress++;
      else reposQueued++;
      repoStats.push({ id: slug, passes: fp.passes, total: fp.total, percent: pct });
    }
    const overallPercent = totalFeatures > 0 ? Math.round((totalPasses / totalFeatures) * 100) : 0;

    // ── Session + token aggregation from log files ────────────────────────
    const logPaths = getLogPaths();
    let totalSessions = 0, totalErrors = 0, totalInputTokens = 0, totalOutputTokens = 0;
    for (const lp of logPaths) {
      const s = scanLogForSessions(lp);
      totalSessions += s.sessions;
      totalErrors += s.errors;
      totalInputTokens += s.inputTokens;
      totalOutputTokens += s.outputTokens;
    }

    // ── Claude cost estimate (Sonnet 3.5: $3/$15 per MTok) ────────────────
    const estimatedCostUSD = ((totalInputTokens / 1_000_000) * 3) + ((totalOutputTokens / 1_000_000) * 15);

    // ── Queue stats ────────────────────────────────────────────────────────
    const completedInQueue: string[] = queueStatus?.completedRepos || [];
    const parallelCompleted: string[] = parallelStatus?.completedRepos || [];
    const totalCompleted = new Set([...completedInQueue, ...parallelCompleted]).size;

    // ── Harness process ────────────────────────────────────────────────────
    const harnessProcesses = countHarnessProcesses();
    const uptimeStr = getHarnessUptime();

    // ── Top completions (most recently completed repos) ────────────────────
    const topComplete = repoStats
      .filter(r => r.percent === 100)
      .slice(0, 5)
      .map(r => r.id);

    return NextResponse.json({
      features: {
        total: totalFeatures,
        passes: totalPasses,
        percent: overallPercent,
      },
      repos: {
        total: repos.filter(r => r.enabled !== false).length,
        complete: reposComplete,
        inProgress: reposInProgress,
        queued: reposQueued,
      },
      sessions: {
        total: totalSessions,
        logFiles: logPaths.length,
      },
      tokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens,
        estimatedCostUSD: Math.round(estimatedCostUSD * 100) / 100,
      },
      errors: {
        total: totalErrors,
      },
      queue: {
        currentRepo: queueStatus?.currentRepo || null,
        completedCount: totalCompleted,
        startedAt: queueStatus?.startedAt || null,
        lastUpdated: queueStatus?.lastUpdated || null,
        uptime: uptimeStr,
      },
      harness: {
        processes: harnessProcesses,
        running: harnessProcesses > 0,
      },
      topComplete,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
