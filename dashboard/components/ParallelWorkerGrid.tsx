'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface FeatureProgress { passes: number; total: number; percent: number; }
interface TokenUsage { input: number; output: number; cache_read: number; cache_create: number; }
interface ChildProcess { pid: number; stat: string; cpu: string; mem: string; }

interface Worker {
  slug: string;
  featureProgress: FeatureProgress;
  idleSecs: number;
  lineCount: number;
  lastLogLine: string;
  type: 'parallel' | 'standalone';
  workerId?: string;
  startedAt?: string;
  suspended?: boolean;
  processStat?: string;
  pid?: number | null;
  children?: ChildProcess[];
  workType?: string;
  lastToolCall?: string;
  agentTodos?: Array<{ content: string; status: string }>;
  tokenUsage?: TokenUsage | null;
  sessionCount?: number;
  errorCount?: number;
  toolCallCounts?: Record<string, number>;
  recentFiles?: { count: number; types: string[] };
  featureVelocity?: number | null;
  stalledSeverity?: 'critical' | 'warning' | null;
  contextSize?: number;
  contextWarning?: 'near-limit' | 'large' | null;
  healthScore?: number;
}

interface AgentStatusData {
  parallelWorkers: Worker[];
  standaloneWorkers: Worker[];
  queueInfo: any;
  suspendedCount: number;
  stalledCount: number;
  activeCount: number;
  doneCount: number;
  avgHealth: number;
  timestamp: string;
}

const REFRESH_INTERVAL = 8000;

const WORK_TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  coding:     { label: 'Coding',      color: 'bg-violet-500/20 text-violet-300 border-violet-500/40', icon: '✏️' },
  running:    { label: 'Running',     color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',       icon: '▶' },
  testing:    { label: 'Testing',     color: 'bg-green-500/20 text-green-300 border-green-500/40',    icon: '✓' },
  planning:   { label: 'Planning',    color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', icon: '📋' },
  reading:    { label: 'Reading',     color: 'bg-blue-500/20 text-blue-300 border-blue-500/40',       icon: '📖' },
  researching:{ label: 'Researching', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', icon: '🔍' },
  working:    { label: 'Working',     color: 'bg-gray-500/20 text-gray-300 border-gray-500/40',       icon: '⚙' },
  unknown:    { label: 'Idle',        color: 'bg-gray-700/30 text-gray-500 border-gray-600/40',       icon: '…' },
};

function statusColor(worker: Worker): string {
  if (worker.suspended) return 'border-red-500/60 bg-red-950/40';
  if (worker.featureProgress.percent === 100) return 'border-green-600/40 bg-green-950/20';
  if (worker.stalledSeverity === 'critical') return 'border-orange-500/60 bg-orange-950/30';
  if (worker.stalledSeverity === 'warning') return 'border-yellow-500/40 bg-yellow-950/20';
  if (worker.contextWarning === 'near-limit') return 'border-purple-500/50 bg-purple-950/20';
  if (worker.idleSecs < 0) return 'border-gray-700/40 bg-gray-900/30';
  if (worker.idleSecs < 120) return 'border-blue-500/50 bg-blue-950/20';
  return 'border-gray-600/30 bg-gray-900/20';
}

function HealthDot({ score }: { score: number | undefined }) {
  const s = score ?? 100;
  const [cls, title] =
    s === 100 ? ['bg-green-400', 'Complete'] :
    s >= 75  ? ['bg-blue-400 animate-pulse', 'Active'] :
    s >= 50  ? ['bg-yellow-400 animate-pulse', 'Warning — idle >10m'] :
    s >= 20  ? ['bg-orange-400 animate-pulse', 'Stalled — needs attention'] :
               ['bg-red-500 animate-pulse', 'Suspended / critical'];
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 mt-0.5 ${cls}`} title={title} />;
}

function statusLabel(worker: Worker): { label: string; color: string } {
  if (worker.suspended) return { label: 'STOPPED', color: 'text-red-400' };
  if (worker.featureProgress.percent === 100) return { label: 'DONE', color: 'text-green-400' };
  if (worker.stalledSeverity === 'critical') return { label: 'STALLED', color: 'text-orange-400' };
  if (worker.stalledSeverity === 'warning') return { label: 'SLOW', color: 'text-yellow-400' };
  if (worker.idleSecs < 0) return { label: 'NO LOG', color: 'text-gray-500' };
  if (worker.idleSecs < 60) return { label: 'ACTIVE', color: 'text-blue-400' };
  if (worker.idleSecs < 600) return { label: 'RECENT', color: 'text-gray-400' };
  return { label: 'IDLE', color: 'text-gray-500' };
}

function formatIdle(secs: number): string {
  if (secs < 0) return '—';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function shortSlug(slug: string): string {
  return slug.replace(/^prd-\d+-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function ContextBar({ size, warning }: { size: number; warning?: string | null }) {
  const MAX = 200_000;
  const pct = Math.min(100, Math.round((size / MAX) * 100));
  const color = warning === 'near-limit' ? 'bg-purple-500' : warning === 'large' ? 'bg-yellow-500' : 'bg-gray-600';
  if (size < 5_000) return null;
  return (
    <div className="flex items-center gap-1.5" title={`Context: ${fmtTokens(size)} / ~200k tokens`}>
      <div className="flex-1 h-1 bg-gray-800 rounded-full">
        <div className={`h-1 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono ${warning === 'near-limit' ? 'text-purple-400' : 'text-gray-600'}`}>
        {fmtTokens(size)}
      </span>
    </div>
  );
}

function WorkerCard({ worker }: { worker: Worker }) {
  const [expanded, setExpanded] = useState(false);
  const { label, color } = statusLabel(worker);
  const border = statusColor(worker);
  const pct = worker.featureProgress.percent;
  const wt = worker.workType || 'unknown';
  const wtMeta = WORK_TYPE_META[wt] || WORK_TYPE_META.working;
  const claudeChild = worker.children?.find(c => parseFloat(c.cpu) > 0);
  const activeTodo = worker.agentTodos?.find(t => t.status.includes('progress'));
  const todoCount = worker.agentTodos?.length || 0;
  const contextSize = worker.contextSize || 0;

  return (
    <div className={`rounded-lg border p-3 ${border} transition-all duration-500 flex flex-col gap-2`}>

      {/* ── Row 1: Identity ── */}
      <div className="flex items-start gap-2">
        <HealthDot score={worker.healthScore} />
        <div className="flex-1 min-w-0">
          {worker.workerId && <div className="text-[10px] text-gray-600 leading-none mb-0.5">worker {worker.workerId}</div>}
          <div className="text-sm font-semibold text-white leading-tight truncate" title={worker.slug}>
            {shortSlug(worker.slug)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[10px] font-bold tracking-wide ${color}`}>{label}</span>
          {!worker.suspended && pct < 100 && wt !== 'unknown' && (
            <span className={`text-[10px] px-1 py-px rounded border ${wtMeta.color}`}>
              {wtMeta.icon} {wtMeta.label}
            </span>
          )}
        </div>
      </div>

      {/* ── Row 2: Progress ── */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>{worker.featureProgress.passes}/{worker.featureProgress.total} features</span>
          <span className={pct === 100 ? 'text-green-400' : 'text-gray-400'}>{pct}%
            {worker.featureVelocity != null && pct < 100 && (
              <span className="text-gray-600 ml-1">· {worker.featureVelocity}/hr</span>
            )}
          </span>
        </div>
        <div className="w-full bg-gray-800/80 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-1000 ${
              pct === 100 ? 'bg-green-500' : pct > 60 ? 'bg-blue-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* ── Row 3: Context window ── */}
      {contextSize > 0 && <ContextBar size={contextSize} warning={worker.contextWarning} />}

      {/* ── Row 4: Stats row (Gestalt: related data grouped) ── */}
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] text-gray-600">
        <span>{formatIdle(worker.idleSecs)}</span>
        {(worker.sessionCount || 0) > 0 && <span>{worker.sessionCount}s</span>}
        {(worker.errorCount || 0) > 0 && <span className="text-red-400/80">{worker.errorCount} err</span>}
        {claudeChild && <span className="text-cyan-700">{claudeChild.cpu}% cpu</span>}
        {worker.recentFiles && worker.recentFiles.count > 0 && (
          <span className="text-violet-500">{worker.recentFiles.count} changed</span>
        )}
      </div>

      {/* ── Row 5: Active todo (recognition over recall) ── */}
      {activeTodo && (
        <div className="text-[10px] text-yellow-300/80 bg-yellow-500/10 rounded px-1.5 py-1 truncate leading-snug" title={activeTodo.content}>
          ▶ {activeTodo.content}
        </div>
      )}

      {/* ── Row 6: Alerts (visibility of system status, user control) ── */}
      {worker.suspended && (
        <div className="text-[10px] text-red-400 bg-red-900/30 rounded px-2 py-1.5 space-y-0.5">
          <div className="font-semibold">⚠ SIGSTOP — process frozen</div>
          <div className="text-red-500/80 font-mono select-all">bash harness/restart-all-agents.sh</div>
        </div>
      )}
      {!worker.suspended && worker.stalledSeverity === 'critical' && (
        <div className="text-[10px] text-orange-400 bg-orange-900/20 rounded px-2 py-1.5">
          <div className="font-semibold">⚠ Stalled {formatIdle(worker.idleSecs)} — no log output</div>
          {(worker.errorCount || 0) > 5 && <div className="text-orange-500/70">{worker.errorCount} errors detected in log</div>}
        </div>
      )}
      {!worker.suspended && worker.stalledSeverity === 'warning' && (
        <div className="text-[10px] text-yellow-500/70 px-1">
          ⚡ Slow — idle {formatIdle(worker.idleSecs)}
        </div>
      )}
      {worker.contextWarning === 'near-limit' && (
        <div className="text-[10px] text-purple-400 bg-purple-900/20 rounded px-2 py-1">
          ⚠ Context near limit ({fmtTokens(contextSize)}/200k) — may need new session
        </div>
      )}

      {/* ── Row 7: Expand toggle (efficiency — shortcut to detail) ── */}
      {todoCount > 0 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[10px] text-gray-700 hover:text-gray-400 transition-colors text-left"
        >
          {expanded ? '▲ hide' : `▼ ${todoCount} tasks · tool breakdown`}
        </button>
      )}

      {/* ── Expandable detail ── */}
      {expanded && (
        <div className="space-y-1 border-t border-gray-800 pt-2">
          {worker.agentTodos?.map((t, i) => (
            <div key={i} className={`text-[10px] flex gap-1.5 items-start ${
              t.status === 'completed' ? 'text-green-600/70' :
              t.status.includes('progress') ? 'text-yellow-300/80' : 'text-gray-600'
            }`}>
              <span className="shrink-0 mt-px">
                {t.status === 'completed' ? '✓' : t.status.includes('progress') ? '▶' : '○'}
              </span>
              <span className="break-words">{t.content}</span>
            </div>
          ))}
          {worker.toolCallCounts && Object.keys(worker.toolCallCounts).length > 0 && (
            <div className="text-[10px] text-gray-700 pt-1 font-mono">
              {Object.entries(worker.toolCallCounts)
                .sort((a, b) => b[1] - a[1]).slice(0, 6)
                .map(([t, n]) => `${t}×${n}`).join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* ── Fallback last log line when no todos ── */}
      {!expanded && !activeTodo && !worker.suspended && worker.lastLogLine && (
        <div className="text-[10px] text-gray-700 font-mono truncate" title={worker.lastLogLine}>
          {worker.lastLogLine.replace(/^\d{4}-\d{2}-\d{2}T[\d:.Z]+\s/, '')}
        </div>
      )}
    </div>
  );
}

function SystemHealthHeader({ data, secondsLeft }: { data: AgentStatusData; secondsLeft: number }) {
  const health = data.avgHealth;
  const healthColor = health >= 80 ? 'text-green-400' : health >= 50 ? 'text-yellow-400' : 'text-red-400';
  const healthLabel = health >= 80 ? 'Healthy' : health >= 50 ? 'Degraded' : 'Critical';
  const allWorkers = [...data.parallelWorkers, ...data.standaloneWorkers];
  const totalFeatures = allWorkers.reduce((s, w) => s + w.featureProgress.total, 0);
  const totalPasses = allWorkers.reduce((s, w) => s + w.featureProgress.passes, 0);
  const overallPct = totalFeatures > 0 ? Math.round((totalPasses / totalFeatures) * 100) : 0;

  return (
    <div className="bg-gray-900/80 border border-gray-700/60 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-6 justify-between">
        {/* Health score — primary status (visibility of system status heuristic) */}
        <div className="flex items-center gap-3">
          <div className={`text-3xl font-bold tabular-nums ${healthColor}`}>{health}</div>
          <div>
            <div className={`text-sm font-semibold ${healthColor}`}>{healthLabel}</div>
            <div className="text-[10px] text-gray-600">system health</div>
          </div>
        </div>

        {/* Stats strip — Gestalt proximity grouping */}
        <div className="flex gap-5">
          {[
            { label: 'Agents', value: allWorkers.length, color: 'text-white' },
            { label: 'Active', value: data.activeCount, color: 'text-blue-400' },
            { label: 'Done', value: data.doneCount, color: 'text-green-400' },
            ...(data.stalledCount > 0 ? [{ label: 'Stalled', value: data.stalledCount, color: 'text-orange-400' }] : []),
            ...(data.suspendedCount > 0 ? [{ label: 'Stopped', value: data.suspendedCount, color: 'text-red-400' }] : []),
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
              <div className="text-[10px] text-gray-600">{label}</div>
            </div>
          ))}
        </div>

        {/* Overall feature progress */}
        <div className="flex-1 min-w-32 max-w-48">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>Features</span>
            <span>{totalPasses}/{totalFeatures} · {overallPct}%</span>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded-full">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 transition-all duration-1000"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>

        {/* Refresh countdown — feedback heuristic */}
        <div className="text-[10px] text-gray-700 tabular-nums shrink-0">
          ↻ {secondsLeft}s
        </div>
      </div>
    </div>
  );
}

interface ParallelWorkerGridProps {
  slugFilter?: string[];
  tagFilter?: string;
}

export default function ParallelWorkerGrid({ slugFilter, tagFilter }: ParallelWorkerGridProps = {}) {
  const [data, setData] = useState<AgentStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_INTERVAL / 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-status');
      if (res.ok) setData(await res.json());
    } catch { /* silent — stale data stays visible */ }
    finally {
      setLoading(false);
      setSecondsLeft(REFRESH_INTERVAL / 1000);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async-poll: setState runs post-await, not synchronously
    fetchData();
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL);
    countdownRef.current = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [fetchData]);

  if (loading) return (
    <div className="bg-gray-900/50 rounded-xl p-8 border border-gray-800 text-center">
      <div className="text-gray-600 text-sm animate-pulse">Connecting to agents…</div>
    </div>
  );

  if (!data) return (
    <div className="bg-gray-900/50 rounded-xl p-6 border border-red-900/50 text-center text-red-500 text-sm">
      Could not reach /api/agent-status
    </div>
  );

  const applyFilter = (workers: Worker[]) => {
    let result = workers;
    if (slugFilter && slugFilter.length > 0) {
      result = result.filter(w => slugFilter.includes(w.slug));
    }
    if (tagFilter) {
      result = result.filter(w => w.slug.includes(tagFilter));
    }
    return result;
  };

  const filteredData: AgentStatusData = slugFilter || tagFilter ? {
    ...data,
    parallelWorkers: applyFilter(data.parallelWorkers),
    standaloneWorkers: applyFilter(data.standaloneWorkers),
  } : data;

  return (
    <div className="space-y-4">
      {/* System health header */}
      <SystemHealthHeader data={filteredData} secondsLeft={secondsLeft} />

      {/* Critical alerts (error prevention / visibility) */}
      {filteredData.suspendedCount > 0 && (
        <div className="bg-red-950/60 border border-red-500/50 rounded-lg px-4 py-3 flex items-start gap-3">
          <span className="text-red-400 text-base shrink-0 mt-px">⚠</span>
          <div>
            <div className="text-red-300 font-semibold text-sm">
              {filteredData.suspendedCount} agent{filteredData.suspendedCount > 1 ? 's' : ''} stopped (SIGSTOP)
            </div>
            <div className="text-red-500/70 text-xs mt-0.5">
              No progress until restarted.{' '}
              <code className="bg-red-900/50 px-1 rounded font-mono select-all">
                bash harness/restart-all-agents.sh
              </code>
            </div>
          </div>
        </div>
      )}
      {filteredData.stalledCount > 0 && filteredData.suspendedCount === 0 && (
        <div className="bg-orange-950/40 border border-orange-500/30 rounded-lg px-4 py-2.5 text-orange-400/80 text-xs">
          ⚡ {filteredData.stalledCount} agent{filteredData.stalledCount > 1 ? 's' : ''} idle &gt;10 min — check logs for errors or context exhaustion
        </div>
      )}

      {/* Parallel workers */}
      {filteredData.parallelWorkers.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-0.5">
            Parallel Workers ({filteredData.parallelWorkers.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
            {filteredData.parallelWorkers.map((w, i) => <WorkerCard key={w.slug || i} worker={w} />)}
          </div>
        </section>
      )}

      {/* Standalone agents */}
      {filteredData.standaloneWorkers.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-0.5">
            {slugFilter || tagFilter ? 'Filtered Agents' : 'Standalone Agents'} ({filteredData.standaloneWorkers.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
            {filteredData.standaloneWorkers.map((w, i) => <WorkerCard key={w.slug || i} worker={w} />)}
          </div>
        </section>
      )}

      {/* Queue strip */}
      {filteredData.queueInfo && (
        <div className="flex flex-wrap gap-4 text-xs text-gray-600 px-1">
          <span>Queue: <span className="text-gray-400 font-mono">{filteredData.queueInfo.currentRepo || '—'}</span></span>
          <span>Completed: <span className="text-green-500/70">{filteredData.queueInfo.completedRepos?.length ?? 0}</span></span>
          {filteredData.queueInfo.lastUpdated && (
            <span>Updated: {new Date(filteredData.queueInfo.lastUpdated).toLocaleTimeString()}</span>
          )}
        </div>
      )}
    </div>
  );
}
