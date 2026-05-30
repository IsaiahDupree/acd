import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  DATA_DIR,
  FEATURES_DIR,
  LOGS_DIR,
  QUEUE_FILE,
  safeReadJson,
  repoSlug,
  resolveFeatureFile,
} from '../../../lib/acd-data';

const PIDS_DIR = path.join(DATA_DIR, 'pids');

function safeReadLines(filePath: string, n: number): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    return lines.slice(-n);
  } catch {
    return [];
  }
}

function parseFeatures(data: any): { passes: number; total: number } | null {
  if (!data) return null;
  const arr: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data.features)
    ? data.features
    : null;
  if (!arr) return null;
  return {
    total: arr.length,
    passes: arr.filter((f: any) => f.passes === true || f.status === 'passing').length,
  };
}

// Build slug→{featureList, repoPath} maps from repo-queue.json once
let _repoMap: Record<string, string> | null = null;
let _repoPathMap: Record<string, string> | null = null;

function getRepoMap(): Record<string, string> {
  if (_repoMap) return _repoMap;
  _repoMap = {};
  _repoPathMap = {};
  const q = safeReadJson(QUEUE_FILE);
  if (q?.repos) {
    for (const r of q.repos as any[]) {
      const id: string = repoSlug(r);
      const fl: string = r.featureList || '';
      if (id && fl) _repoMap[id] = fl;
      // Resolve repo path: r.path is relative to the data dir
      if (id && r.path) {
        const rp = r.path.startsWith('/') ? r.path : path.join(DATA_DIR, r.path);
        _repoPathMap[id] = rp;
      }
    }
  }
  return _repoMap;
}

function getRepoPath(slug: string): string {
  getRepoMap(); // ensure maps are built
  return _repoPathMap?.[slug] || '';
}

function findLogPath(slug: string): string {
  const candidates = [
    path.join(LOGS_DIR, 'agent-prds', `${slug}.log`),
    path.join(LOGS_DIR, `${slug}.log`),
  ];
  for (const p of candidates) {
    try { fs.statSync(p); return p; } catch { /* try next */ }
  }
  return '';
}

function getFeatureProgress(slug: string): { passes: number; total: number; percent: number } {
  const map = getRepoMap();

  // Candidates in priority order
  const candidates: string[] = [];

  // 1. Canonical ACD feature file (data/features/<slug>.json), then the
  //    queue's featureList path as a fallback.
  candidates.push(resolveFeatureFile(slug, map[slug]));

  // 2. Direct canonical lookup by slug (in case resolveFeatureFile fell back).
  candidates.push(path.join(FEATURES_DIR, `${slug}.json`));

  for (const p of candidates) {
    const data = safeReadJson(p);
    const result = parseFeatures(data);
    if (result && result.total > 0) {
      return {
        ...result,
        percent: Math.round((result.passes / result.total) * 100),
      };
    }
  }
  return { passes: 0, total: 0, percent: 0 };
}

// ── Tool name → work-type classification ─────────────────────────────────────
const TOOL_WORK_TYPE: Record<string, string> = {
  Edit: 'coding', Write: 'coding', MultiEdit: 'coding', NotebookEdit: 'coding',
  Bash: 'running', mcp__ide__getDiagnostics: 'testing',
  TodoWrite: 'planning', TodoRead: 'planning',
  Read: 'reading', Glob: 'reading', Grep: 'reading', LS: 'reading',
  WebSearch: 'researching', WebFetch: 'researching',
};

function classifyTool(name: string): string {
  return TOOL_WORK_TYPE[name] || 'working';
}

interface LogActivity {
  workType: string;
  lastToolCall: string;
  agentTodos: Array<{ content: string; status: string }>;
  tokenUsage: { input: number; output: number; cache_read: number; cache_create: number } | null;
  sessionCount: number;
  errorCount: number;
  toolCallCounts: Record<string, number>;
}

function parseLogActivity(logPath: string): LogActivity {
  const fallback: LogActivity = {
    workType: 'unknown', lastToolCall: '', agentTodos: [],
    tokenUsage: null, sessionCount: 0, errorCount: 0, toolCallCounts: {},
  };
  try {
    const stat = fs.statSync(logPath);
    const size = stat.size;
    // Read last 200KB to parse recent activity
    const readBytes = Math.min(200 * 1024, size);
    const buf = Buffer.alloc(readBytes);
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buf, 0, readBytes, size - readBytes);
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    const lines = text.split('\n').filter(l => l.trim().startsWith('{'));

    let lastToolCall = '';
    let agentTodos: Array<{ content: string; status: string }> = [];
    const sessions = new Set<string>();
    let errorCount = 0;
    const toolCounts: Record<string, number> = {};
    let lastInput = 0, lastOutput = 0, lastCacheRead = 0, lastCacheCreate = 0;
    let hasTokens = false;

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const sid = obj.session_id;
        if (sid) sessions.add(sid);
        const msg = obj.message || {};
        for (const item of (msg.content || [])) {
          if (item.type === 'tool_use') {
            const name: string = item.name || '';
            lastToolCall = name;
            toolCounts[name] = (toolCounts[name] || 0) + 1;
            if (name === 'TodoWrite') {
              const todos = item.input?.todos;
              if (Array.isArray(todos)) {
                agentTodos = todos.map((t: any) => ({
                  content: (t.content || '').slice(0, 80),
                  status: t.status || '?',
                }));
              }
            }
          }
          if (item.type === 'tool_result') {
            const content = JSON.stringify(item.content || '');
            if (/error|Error|failed|Failed/i.test(content)) errorCount++;
          }
        }
        const usage = msg.usage;
        if (usage) {
          hasTokens = true;
          lastInput = usage.input_tokens || 0;
          lastOutput = usage.output_tokens || 0;
          lastCacheRead = usage.cache_read_input_tokens || 0;
          lastCacheCreate = usage.cache_creation_input_tokens || 0;
        }
      } catch { /* skip malformed */ }
    }

    const workType = lastToolCall ? classifyTool(lastToolCall) : 'unknown';
    return {
      workType,
      lastToolCall,
      agentTodos,
      tokenUsage: hasTokens ? { input: lastInput, output: lastOutput, cache_read: lastCacheRead, cache_create: lastCacheCreate } : null,
      sessionCount: sessions.size,
      errorCount,
      toolCallCounts: toolCounts,
    };
  } catch {
    return fallback;
  }
}

function getChildProcesses(pid: number | null | undefined): Array<{ pid: number; stat: string; cpu: string; mem: string }> {
  if (!pid) return [];
  try {
    const allPids = execSync(`ps -o pid=,ppid=,stat=,pcpu=,pmem= -e`, { timeout: 3000 }).toString().trim().split('\n');
    return allPids
      .map(l => l.trim().split(/\s+/))
      .filter(p => p.length >= 5 && parseInt(p[1]) === pid)
      .map(p => ({ pid: parseInt(p[0]), stat: p[2], cpu: p[3], mem: p[4] }));
  } catch {
    return [];
  }
}

function getRecentFileChanges(repoPath: string, withinMinutes = 5): { count: number; types: string[] } {
  if (!repoPath) return { count: 0, types: [] };
  try {
    const out = execSync(
      `find "${repoPath}" -newer "${repoPath}/.git/HEAD" -type f ! -path '*/.git/*' ! -path '*/node_modules/*' ! -path '*/__pycache__/*' -mmin -${withinMinutes} 2>/dev/null | head -30`,
      { timeout: 3000 }
    ).toString().trim();
    if (!out) return { count: 0, types: [] };
    const files = out.split('\n').filter(Boolean);
    const exts = [...new Set(files.map(f => f.split('.').pop()?.toLowerCase() || ''))].filter(Boolean);
    return { count: files.length, types: exts };
  } catch {
    return { count: 0, types: [] };
  }
}

function getProcessStat(pid: number | null | undefined): { suspended: boolean; stat: string } {
  if (!pid) return { suspended: false, stat: '' };
  try {
    const stat = execSync(`ps -o stat= -p ${pid} 2>/dev/null`, { timeout: 2000 }).toString().trim();
    return { suspended: stat.startsWith('T'), stat };
  } catch {
    return { suspended: false, stat: '' };
  }
}

function getProcessPid(slug: string): number | null {
  try {
    // ACD writes per-slug pid files to data/pids/<slug>.json (legacy:
    // harness-status-<slug>.json in the same dir).
    const candidates = [
      path.join(PIDS_DIR, `${slug}.json`),
      path.join(PIDS_DIR, `harness-status-${slug}.json`),
      path.join(DATA_DIR, `harness-status-${slug}.json`),
    ];
    for (const f of candidates) {
      const data = safeReadJson(f);
      if (data?.pid) return Number(data.pid);
    }
    return null;
  } catch {
    return null;
  }
}

function getLogSummary(slug: string): { lastLine: string; idleSecs: number; lineCount: number } {
  const logPaths = [
    path.join(LOGS_DIR, 'agent-prds', `${slug}.log`),
    path.join(LOGS_DIR, `${slug}.log`),
  ];

  for (const p of logPaths) {
    try {
      const stat = fs.statSync(p);
      const idleSecs = Math.round((Date.now() - stat.mtimeMs) / 1000);
      const lines = safeReadLines(p, 3);
      const lineCount = fs.readFileSync(p, 'utf8').split('\n').length;
      return { lastLine: lines[lines.length - 1] || '', idleSecs, lineCount };
    } catch {
      continue;
    }
  }
  return { lastLine: '', idleSecs: -1, lineCount: 0 };
}

function computeRobustness(worker: {
  featureProgress: { passes: number; percent: number };
  idleSecs: number;
  suspended: boolean;
  tokenUsage: { input: number; cache_read: number } | null;
  errorCount: number;
  logPath: string;
}): {
  featureVelocity: number | null;   // features/hr since log start
  stalledSeverity: 'critical' | 'warning' | null;
  contextSize: number;
  contextWarning: 'near-limit' | 'large' | null;
  healthScore: number;              // 0-100
} {
  // Feature velocity: passes / hours since log creation
  let featureVelocity: number | null = null;
  if (worker.logPath && worker.featureProgress.passes > 0) {
    try {
      const st = fs.statSync(worker.logPath);
      const hoursElapsed = (Date.now() - st.birthtimeMs) / 3600000;
      if (hoursElapsed > 0.05) {
        featureVelocity = Math.round((worker.featureProgress.passes / hoursElapsed) * 10) / 10;
      }
    } catch { /* no log yet */ }
  }

  // Stall detection: long idle + not done + not suspended
  let stalledSeverity: 'critical' | 'warning' | null = null;
  if (!worker.suspended && worker.featureProgress.percent < 100 && worker.idleSecs >= 0) {
    if (worker.idleSecs > 1800 || (worker.idleSecs > 600 && worker.errorCount > 10)) {
      stalledSeverity = 'critical';
    } else if (worker.idleSecs > 600) {
      stalledSeverity = 'warning';
    }
  }

  // Context window tracking
  const contextSize = (worker.tokenUsage?.input || 0) + (worker.tokenUsage?.cache_read || 0);
  let contextWarning: 'near-limit' | 'large' | null = null;
  if (contextSize > 180000) contextWarning = 'near-limit';
  else if (contextSize > 100000) contextWarning = 'large';

  // Health score 0-100 (higher = healthier)
  let healthScore = 100;
  if (worker.suspended) healthScore = 0;
  else if (stalledSeverity === 'critical') healthScore = 20;
  else if (stalledSeverity === 'warning') healthScore = 50;
  else if (contextWarning === 'near-limit') healthScore = Math.min(healthScore, 60);
  else if (worker.errorCount > 5) healthScore = Math.min(healthScore, 75);
  if (worker.featureProgress.percent === 100) healthScore = 100;

  return { featureVelocity, stalledSeverity, contextSize, contextWarning, healthScore };
}

export async function GET() {
  // Refresh repo map on every request so queue edits are reflected immediately
  _repoMap = null;

  try {
    // Read parallel-status.json for the run-parallel workers
    const parallelStatus = safeReadJson(path.join(DATA_DIR, 'parallel-status.json'));
    const queueStatus = safeReadJson(path.join(DATA_DIR, 'queue-status.json'));

    // Build worker list from parallel-status
    const parallelWorkers: any[] = [];
    if (parallelStatus?.workers) {
      for (const [workerId, info] of Object.entries(parallelStatus.workers as Record<string, any>)) {
        const slug = info.currentRepo || '';
        const featureProgress = slug ? getFeatureProgress(slug) : { passes: 0, total: 0, percent: 0 };
        const logSummary = slug ? getLogSummary(slug) : { lastLine: '', idleSecs: -1, lineCount: 0 };

        const pid = info.pid ? Number(info.pid) : getProcessPid(slug);
        const procState = getProcessStat(pid);
        const logPath = slug ? findLogPath(slug) : '';
        const logActivity = logPath ? parseLogActivity(logPath) : null;
        const children = getChildProcesses(pid);
        const repoPath = getRepoPath(slug);
        const recentFiles = repoPath ? getRecentFileChanges(repoPath, 5) : { count: 0, types: [] };

        const tokenUsage = logActivity?.tokenUsage || null;
        const errorCount = logActivity?.errorCount || 0;
        const robustness = computeRobustness({
          featureProgress, idleSecs: logSummary.idleSecs, suspended: procState.suspended,
          tokenUsage, errorCount, logPath,
        });

        parallelWorkers.push({
          workerId,
          slug,
          startedAt: info.startedAt,
          featureProgress,
          idleSecs: logSummary.idleSecs,
          lineCount: logSummary.lineCount,
          lastLogLine: logSummary.lastLine,
          suspended: procState.suspended,
          processStat: procState.stat,
          pid,
          children,
          workType: logActivity?.workType || 'unknown',
          lastToolCall: logActivity?.lastToolCall || '',
          agentTodos: logActivity?.agentTodos || [],
          tokenUsage,
          sessionCount: logActivity?.sessionCount || 0,
          errorCount,
          toolCallCounts: logActivity?.toolCallCounts || {},
          recentFiles,
          ...robustness,
          type: 'parallel',
        });
      }
    }

    // Build dynamic agent list from repo-queue.json
    // Show: (a) anything currently in parallel-status workers, (b) anything incomplete from queue
    const completedInParallel = new Set<string>(parallelStatus?.completedRepos || []);
    const activeInParallel = new Set<string>(
      Object.values((parallelStatus?.workers || {}) as Record<string, any>)
        .map((w: any) => w.currentRepo).filter(Boolean)
    );

    const queueFile = safeReadJson(QUEUE_FILE);
    const allQueuedRepos: string[] = (queueFile?.repos || [])
      .filter((r: any) => r.enabled !== false)
      .map((r: any) => repoSlug(r))
      .filter(Boolean);

    // Include: queued repos that aren't 100% done yet, plus any active parallel worker slugs
    const standaloneAgents = [
      ...activeInParallel,
      ...allQueuedRepos.filter((id: string) => {
        if (activeInParallel.has(id)) return false; // already included above
        const fp = getFeatureProgress(id);
        return fp.percent < 100; // only show incomplete
      }),
    ].slice(0, 60); // cap at 60 to avoid overwhelming the UI

    const standaloneWorkers = standaloneAgents.map((slug) => {
      const featureProgress = getFeatureProgress(slug);
      const logSummary = getLogSummary(slug);
      const pid = getProcessPid(slug);
      const procState = getProcessStat(pid);
      const logPath = findLogPath(slug);
      const logActivity = logPath ? parseLogActivity(logPath) : null;
      const children = getChildProcesses(pid);
      const repoPath = getRepoPath(slug);
      const recentFiles = repoPath ? getRecentFileChanges(repoPath, 5) : { count: 0, types: [] };

      const tokenUsage = logActivity?.tokenUsage || null;
      const errorCount = logActivity?.errorCount || 0;
      const robustness = computeRobustness({
        featureProgress, idleSecs: logSummary.idleSecs, suspended: procState.suspended,
        tokenUsage, errorCount, logPath,
      });

      return {
        slug,
        featureProgress,
        idleSecs: logSummary.idleSecs,
        lineCount: logSummary.lineCount,
        lastLogLine: logSummary.lastLine,
        suspended: procState.suspended,
        processStat: procState.stat,
        pid,
        children,
        workType: logActivity?.workType || 'unknown',
        lastToolCall: logActivity?.lastToolCall || '',
        agentTodos: logActivity?.agentTodos || [],
        tokenUsage,
        sessionCount: logActivity?.sessionCount || 0,
        errorCount,
        toolCallCounts: logActivity?.toolCallCounts || {},
        recentFiles,
        ...robustness,
        type: 'standalone',
      };
    });

    // Current queue status
    const queueInfo = queueStatus
      ? {
          currentRepo: queueStatus.currentRepo,
          completedRepos: queueStatus.completedRepos || [],
          startedAt: queueStatus.startedAt,
          lastUpdated: queueStatus.lastUpdated,
        }
      : null;

    const allWorkers = [...parallelWorkers, ...standaloneWorkers];
    const suspendedCount = allWorkers.filter((w: any) => w.suspended).length;
    const stalledCount = allWorkers.filter((w: any) => w.stalledSeverity === 'critical' || w.stalledSeverity === 'warning').length;
    const activeCount = allWorkers.filter((w: any) => !w.suspended && !w.stalledSeverity && w.idleSecs >= 0 && w.idleSecs < 120 && w.featureProgress.percent < 100).length;
    const doneCount = allWorkers.filter((w: any) => w.featureProgress.percent === 100).length;
    const avgHealth = allWorkers.length > 0
      ? Math.round(allWorkers.reduce((s: number, w: any) => s + (w.healthScore || 0), 0) / allWorkers.length)
      : 100;

    return NextResponse.json({
      parallelWorkers,
      standaloneWorkers,
      queueInfo,
      suspendedCount,
      stalledCount,
      activeCount,
      doneCount,
      avgHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
