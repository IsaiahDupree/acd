'use client';

import { useEffect, useState } from 'react';

interface FeatureProgress { passes: number; total: number; percent: number; }

interface PrdRepo {
  id: string;
  name: string;
  complexity: string;
  focus: string;
  tags: string[];
  priority: number;
  enabled: boolean;
  featureProgress: FeatureProgress;
  status: 'done' | 'in-progress' | 'started' | 'queued';
}

interface ComplexityGroup { total: number; done: number; inProgress: number; queued: number; }

interface TagStat { tag: string; total: number; done: number; inProgress: number; }

interface CoverageData {
  repos: PrdRepo[];
  summary: {
    total: number; enabled: number;
    byStatus: { done: number; inProgress: number; started: number; queued: number };
    totalFeatures: number; totalPasses: number;
  };
  byComplexity: Record<string, ComplexityGroup>;
  topTags: TagStat[];
  gaps: Array<{ id: string; name: string; complexity: string; tags: string[]; priority: number; featureTotal: number }>;
  needsFeatureDesign: Array<{ id: string; name: string; complexity: string; tags: string[] }>;
  timestamp: string;
}

const STATUS_COLORS: Record<string, string> = {
  done: 'bg-green-500/20 text-green-400 border-green-500/40',
  'in-progress': 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  started: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  queued: 'bg-gray-700/40 text-gray-500 border-gray-600/30',
};

const COMPLEXITY_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-green-400',
  unknown: 'text-gray-500',
};

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-gray-700/60 rounded-full">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

type FilterStatus = 'all' | 'done' | 'in-progress' | 'queued';
type FilterComplexity = 'all' | 'critical' | 'high' | 'medium' | 'low';

export default function PrdCoveragePanel() {
  const [data, setData] = useState<CoverageData | null>(null);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterComplexity, setFilterComplexity] = useState<FilterComplexity>('all');
  const [filterTag, setFilterTag] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<'overview' | 'repos' | 'gaps'>('overview');

  useEffect(() => {
    const load = () =>
      fetch('/api/prd-coverage')
        .then(r => r.json())
        .then(d => { setData(d); setError(''); })
        .catch(e => setError(e.message));
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  if (error) return <div className="text-red-400 text-sm p-4">{error}</div>;
  if (!data) return (
    <div className="animate-pulse bg-gray-800/40 rounded-xl h-32 flex items-center justify-center">
      <span className="text-gray-600 text-sm">Loading PRD coverage…</span>
    </div>
  );

  const { summary, byComplexity, topTags, gaps, needsFeatureDesign, repos } = data;
  const overallPct = summary.totalFeatures > 0
    ? Math.round((summary.totalPasses / summary.totalFeatures) * 100) : 0;

  // Apply filters
  const filtered = repos.filter(r => {
    if (filterStatus !== 'all') {
      if (filterStatus === 'queued' && r.status !== 'queued' && r.status !== 'started') return false;
      else if (filterStatus !== 'queued' && r.status !== filterStatus) return false;
    }
    if (filterComplexity !== 'all' && r.complexity !== filterComplexity) return false;
    if (filterTag && !r.tags.includes(filterTag)) return false;
    return true;
  }).sort((a, b) => a.priority - b.priority);

  const displayed = showAll ? filtered : filtered.slice(0, 20);

  return (
    <div className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-base">PRD Coverage</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            {summary.total} repos · {summary.totalPasses}/{summary.totalFeatures} features · {overallPct}% complete
          </p>
        </div>
        <div className="flex gap-1">
          {(['overview', 'repos', 'gaps'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded transition-colors capitalize ${
                view === v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Status summary bar */}
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { label: 'Done', value: summary.byStatus.done, color: 'text-green-400' },
          { label: 'Active', value: summary.byStatus.inProgress + summary.byStatus.started, color: 'text-blue-400' },
          { label: 'Queued', value: summary.byStatus.queued, color: 'text-gray-400' },
          { label: 'Need Design', value: needsFeatureDesign.length, color: 'text-orange-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-800/40 rounded-lg py-2 px-1">
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {view === 'overview' && (
        <div className="space-y-4">
          {/* Complexity breakdown */}
          <div>
            <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">By Complexity</h3>
            <div className="space-y-2">
              {(['critical', 'high', 'medium', 'low'] as const).map(c => {
                const g = byComplexity[c];
                if (!g) return null;
                return (
                  <div key={c} className="flex items-center gap-3">
                    <span className={`text-xs w-14 capitalize ${COMPLEXITY_COLORS[c]}`}>{c}</span>
                    <div className="flex-1">
                      <MiniBar value={g.done} max={g.total} color="bg-green-500" />
                    </div>
                    <span className="text-xs text-gray-600 w-24 text-right">
                      {g.done} done · {g.inProgress} active · {g.queued} queued
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top tags */}
          <div>
            <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">Top Tags Coverage</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {topTags.slice(0, 12).map(({ tag, total, done, inProgress }) => (
                <div key={tag} className="flex items-center gap-2">
                  <button
                    onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
                    className={`text-xs font-mono px-1.5 py-0.5 rounded border transition-colors ${
                      filterTag === tag
                        ? 'bg-indigo-600/40 border-indigo-500/60 text-indigo-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    #{tag}
                  </button>
                  <div className="flex-1">
                    <MiniBar value={done + inProgress} max={total} color="bg-blue-500" />
                  </div>
                  <span className="text-xs text-gray-600">{total}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Overall progress */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Overall feature coverage</span>
              <span>{summary.totalPasses} / {summary.totalFeatures}</span>
            </div>
            <div className="w-full h-3 bg-gray-700/60 rounded-full overflow-hidden">
              <div
                className="h-3 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all duration-1000"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* REPOS TAB */}
      {view === 'repos' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1">
              {(['all', 'done', 'in-progress', 'queued'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`text-xs px-2 py-0.5 rounded capitalize transition-colors ${
                    filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setFilterComplexity(c)}
                  className={`text-xs px-2 py-0.5 rounded capitalize transition-colors ${
                    filterComplexity === c ? 'bg-indigo-600 text-white' : `${COMPLEXITY_COLORS[c]} bg-gray-800 hover:opacity-80`
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {filterTag && (
              <button onClick={() => setFilterTag('')} className="text-xs text-indigo-400 hover:text-white">
                #{filterTag} ×
              </button>
            )}
            <span className="text-xs text-gray-600 ml-auto">{filtered.length} repos</span>
          </div>

          {/* Repo list */}
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {displayed.map(r => (
              <div key={r.id} className="flex items-center gap-3 bg-gray-800/40 rounded-lg px-3 py-2">
                <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${STATUS_COLORS[r.status]}`}>
                  {r.status === 'in-progress' ? 'active' : r.status}
                </span>
                <span className={`text-xs w-12 capitalize ${COMPLEXITY_COLORS[r.complexity]}`}>{r.complexity}</span>
                <span className="text-sm text-white flex-1 min-w-0 truncate font-mono" title={r.id}>{r.id}</span>
                <div className="w-20 shrink-0">
                  <MiniBar
                    value={r.featureProgress.passes}
                    max={r.featureProgress.total || 1}
                    color={r.status === 'done' ? 'bg-green-500' : 'bg-blue-500'}
                  />
                </div>
                <span className="text-xs text-gray-600 w-16 text-right">
                  {r.featureProgress.passes}/{r.featureProgress.total}
                </span>
              </div>
            ))}
          </div>
          {filtered.length > 20 && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              {showAll ? '▲ show less' : `▼ show all ${filtered.length} repos`}
            </button>
          )}
        </div>
      )}

      {/* GAPS TAB */}
      {view === 'gaps' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">
              Next Up — Highest Priority Queued
            </h3>
            <div className="space-y-1.5">
              {gaps.slice(0, 12).map(r => (
                <div key={r.id} className="flex items-center gap-3 bg-gray-800/40 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-600 w-8 text-right font-mono">{r.priority}</span>
                  <span className={`text-xs w-12 capitalize ${COMPLEXITY_COLORS[r.complexity]}`}>{r.complexity}</span>
                  <span className="text-sm text-white flex-1 min-w-0 truncate font-mono" title={r.id}>{r.id}</span>
                  <div className="flex gap-1">
                    {r.tags.slice(0, 3).map(t => (
                      <span key={t} className="text-xs text-gray-600 font-mono">#{t}</span>
                    ))}
                  </div>
                  <span className="text-xs text-gray-600 shrink-0">{r.featureTotal} feats</span>
                </div>
              ))}
            </div>
          </div>

          {needsFeatureDesign.length > 0 && (
            <div>
              <h3 className="text-xs text-orange-500/80 uppercase tracking-wide mb-2">
                ⚠ Needs Feature List Designed ({needsFeatureDesign.length})
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {needsFeatureDesign.map(r => (
                  <div key={r.id} className="flex items-center gap-3 bg-orange-900/10 border border-orange-500/20 rounded-lg px-3 py-2">
                    <span className={`text-xs w-14 capitalize ${COMPLEXITY_COLORS[r.complexity]}`}>{r.complexity}</span>
                    <span className="text-sm text-orange-200/70 flex-1 font-mono truncate">{r.id}</span>
                    <div className="flex gap-1">
                      {r.tags.slice(0, 3).map(t => (
                        <span key={t} className="text-xs text-gray-600 font-mono">#{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
