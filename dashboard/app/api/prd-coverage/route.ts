import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  DATA_DIR,
  LOGS_DIR,
  QUEUE_FILE,
  safeReadJson,
  repoSlug,
  resolveFeatureFile,
} from '../../../lib/acd-data';

function resolveFeatureProgress(slug: string, featureListPath?: string): { passes: number; total: number; percent: number } {
  const absPath = resolveFeatureFile(slug, featureListPath);
  const data = safeReadJson(absPath);
  if (!data) return { passes: 0, total: 0, percent: 0 };
  const arr: any[] = Array.isArray(data) ? data : Array.isArray(data.features) ? data.features : [];
  if (!arr.length) return { passes: 0, total: 0, percent: 0 };
  const passes = arr.filter((f: any) => f.passes === true || f.status === 'passing').length;
  return { passes, total: arr.length, percent: Math.round((passes / arr.length) * 100) };
}

function detectRepoStatus(slug: string, featureProgress: { passes: number; total: number; percent: number }): string {
  // Check if a harness log exists to see if it's been run
  const logCandidates = [
    path.join(LOGS_DIR, 'agent-prds', `${slug}.log`),
    path.join(LOGS_DIR, `${slug}.log`),
  ];
  const hasLog = logCandidates.some(p => { try { fs.statSync(p); return true; } catch { return false; } });

  if (featureProgress.percent === 100) return 'done';
  if (featureProgress.passes > 0) return 'in-progress';
  if (hasLog) return 'started';
  return 'queued';
}

export async function GET() {
  try {
    const q = safeReadJson(QUEUE_FILE);
    const repos: any[] = q?.repos || [];

    // Build enriched repo list
    const enriched = repos.map((r: any) => {
      const id: string = repoSlug(r);
      const featureList: string = r.featureList || '';
      const featureProgress = resolveFeatureProgress(id, featureList);
      const status = detectRepoStatus(id, featureProgress);

      // Infer repo path
      let repoPath = '';
      if (r.path) {
        repoPath = r.path.startsWith('/') ? r.path : path.join(DATA_DIR, r.path);
      }

      return {
        id,
        name: r.name || id,
        complexity: r.complexity || 'unknown',
        focus: r.focus || '',
        tags: r.tags || [],
        priority: r.priority ?? 0,
        enabled: r.enabled !== false,
        untilComplete: r.untilComplete || false,
        featureProgress,
        status,
        repoPath,
        prompt: r.prompt || '',
      };
    });

    // Coverage stats
    const total = enriched.length;
    const enabled = enriched.filter(r => r.enabled).length;
    const byStatus = {
      done: enriched.filter(r => r.status === 'done').length,
      inProgress: enriched.filter(r => r.status === 'in-progress').length,
      started: enriched.filter(r => r.status === 'started').length,
      queued: enriched.filter(r => r.status === 'queued').length,
    };

    // Group by complexity
    const byComplexity: Record<string, { total: number; done: number; inProgress: number; queued: number }> = {};
    for (const r of enriched) {
      const c = r.complexity;
      if (!byComplexity[c]) byComplexity[c] = { total: 0, done: 0, inProgress: 0, queued: 0 };
      byComplexity[c].total++;
      if (r.status === 'done') byComplexity[c].done++;
      else if (r.status === 'in-progress' || r.status === 'started') byComplexity[c].inProgress++;
      else byComplexity[c].queued++;
    }

    // Group by top tags (limit to meaningful tags)
    const tagCounts: Record<string, { total: number; done: number; inProgress: number }> = {};
    for (const r of enriched) {
      for (const tag of (r.tags || [])) {
        if (!tagCounts[tag]) tagCounts[tag] = { total: 0, done: 0, inProgress: 0 };
        tagCounts[tag].total++;
        if (r.status === 'done') tagCounts[tag].done++;
        else if (r.status === 'in-progress' || r.status === 'started') tagCounts[tag].inProgress++;
      }
    }
    // Sort tags by total desc, keep top 20
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 20)
      .map(([tag, counts]) => ({ tag, ...counts }));

    // Gap analysis: queued repos sorted by priority (most negative = highest priority)
    const gaps = enriched
      .filter(r => r.status === 'queued' && r.enabled)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 15)
      .map(r => ({
        id: r.id,
        name: r.name,
        complexity: r.complexity,
        tags: r.tags,
        priority: r.priority,
        featureTotal: r.featureProgress.total,
      }));

    // Design suggestions: repos with 0 features defined (need feature list designed)
    const needsFeatureDesign = enriched
      .filter(r => r.enabled && r.featureProgress.total === 0)
      .map(r => ({ id: r.id, name: r.name, complexity: r.complexity, tags: r.tags }));

    return NextResponse.json({
      repos: enriched,
      summary: { total, enabled, byStatus, totalFeatures: enriched.reduce((s, r) => s + r.featureProgress.total, 0), totalPasses: enriched.reduce((s, r) => s + r.featureProgress.passes, 0) },
      byComplexity,
      topTags,
      gaps,
      needsFeatureDesign,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
