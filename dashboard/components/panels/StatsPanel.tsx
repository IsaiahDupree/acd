'use client';

import { usePanelData } from '@/lib/use-panel-data';

interface DashboardStatsData {
  features: { total: number; passes: number; percent: number };
  repos: { total: number; complete: number; inProgress: number; queued: number };
  sessions: { total: number; logFiles: number };
  tokens: { input: number; output: number; total: number; estimatedCostUSD: number };
  errors: { total: number };
  queue: { currentRepo: string | null; completedCount: number; uptime: string | null; startedAt: string | null };
  harness: { processes: number; running: boolean };
  timestamp: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

type StatRow = {
  label: string;
  value: (d: DashboardStatsData) => string;
  sub?: (d: DashboardStatsData) => string;
  color: string | ((d: DashboardStatsData) => string);
  icon: string;
};

const STAT_ROWS: StatRow[] = [
  {
    label: 'Features Complete',
    value: (d) => `${d.features.passes.toLocaleString()} / ${d.features.total.toLocaleString()}`,
    sub: (d) => `${d.features.percent}% across all repos`,
    color: 'text-green-400',
    icon: '✓',
  },
  {
    label: 'Repos',
    value: (d) => `${d.repos.complete} done`,
    sub: (d) => `${d.repos.inProgress} active · ${d.repos.queued} queued`,
    color: 'text-blue-400',
    icon: '⬢',
  },
  {
    label: 'Queue Completed',
    value: (d) => `${d.queue.completedCount} jobs`,
    sub: (d) => d.queue.uptime ? `Harness up ${d.queue.uptime}` : d.queue.currentRepo ? `Now: ${d.queue.currentRepo.replace(/^prd-\d+-/, '')}` : 'Idle',
    color: 'text-violet-400',
    icon: '⏱',
  },
  {
    label: 'Tokens Used',
    value: (d) => `${fmt(d.tokens.input + d.tokens.output)}`,
    sub: (d) => d.tokens.estimatedCostUSD > 0 ? `~$${d.tokens.estimatedCostUSD.toFixed(2)} est.` : 'Using OAuth subscription',
    color: 'text-yellow-400',
    icon: '⚡',
  },
  {
    label: 'Log Files',
    value: (d) => `${d.sessions.logFiles}`,
    sub: (d) => `${d.sessions.total > 0 ? d.sessions.total + ' sessions tracked' : 'Analyzing sessions…'}`,
    color: 'text-cyan-400',
    icon: '📋',
  },
  {
    label: 'Errors in Logs',
    value: (d) => `${d.errors.total.toLocaleString()}`,
    sub: (d) => d.errors.total === 0 ? 'Clean run' : 'Across all agent logs',
    color: (d: DashboardStatsData) => d.errors.total > 500 ? 'text-red-400' : d.errors.total > 100 ? 'text-orange-400' : 'text-gray-400',
    icon: '⚠',
  },
];

export function StatsPanel() {
  const { data, loading, error, lastUpdated, refresh } = usePanelData<DashboardStatsData>(
    '/api/dashboard-stats',
    30_000,
  );

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-gray-800/40 rounded-xl h-20 border border-gray-700/40" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-sm text-gray-500 italic py-4 text-center">
        {error ?? 'Stats unavailable'}
      </div>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Overall Feature Progress</span>
          <span className="font-mono">
            {data.features.passes.toLocaleString()} / {data.features.total.toLocaleString()} · {data.features.percent}%
          </span>
        </div>
        <div className="w-full h-2.5 bg-gray-800/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-blue-400 to-cyan-400 rounded-full transition-all duration-1000"
            style={{ width: `${data.features.percent}%` }}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAT_ROWS.map((row) => {
          const color = typeof row.color === 'function' ? row.color(data) : row.color;
          return (
            <div
              key={row.label}
              className="bg-gray-800/40 hover:bg-gray-800/60 border border-gray-700/40 rounded-xl px-4 py-3 transition-colors"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm leading-none opacity-60">{row.icon}</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">{row.label}</span>
              </div>
              <div className={`text-xl font-bold tabular-nums ${color}`}>
                {row.value(data)}
              </div>
              {row.sub && (
                <div className="text-[10px] text-gray-600 mt-0.5 leading-snug">
                  {row.sub(data)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 px-1">
        <div className="text-[10px] text-gray-700">
          {data.harness.running
            ? `${data.harness.processes} harness process${data.harness.processes !== 1 ? 'es' : ''} running`
            : 'Harness not running'}
        </div>
        <button onClick={refresh} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
          {lastUpdated ? `↻ ${lastUpdated.toLocaleTimeString()}` : '↻'}
        </button>
      </div>
    </div>
  );
}
