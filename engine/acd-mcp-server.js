#!/usr/bin/env node

import { createInterface } from 'readline';
import { createServer } from 'http';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync, readdirSync, statSync, openSync, readSync, closeSync } from 'fs';
import * as rateCoord from './rate-limit-coordinator.js';
import { join, basename, resolve, dirname } from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';
import {
  ACD_ROOT as PKG_ACD_ROOT, ENGINE_DIR, FEATURES_DIR, PRDS_DIR,
  LOGS_DIR, PIDS_DIR, METRICS_DIR, SCHEDULE_FILE,
  featureFile, prdFile, PORTS,
} from './paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Handle --version flag
if (process.argv.includes('--version')) {
  console.log('acd-mcp-server 1.0.0');
  process.exit(0);
}

const ACD_ROOT = PKG_ACD_ROOT;

// ─── Machine-specific defaults (env-overridable) ──────────────────────────────
// The current/legacy values are kept as documented defaults so behavior is
// unchanged on the original machine, but every one can be repointed via env.
const GOALS_PATH = process.env.GOALS_PATH || join(os.homedir(), 'Documents', 'Software', 'business-goals.json');
const SOFTWARE_ROOT = process.env.SOFTWARE_ROOT || join(os.homedir(), 'Documents', 'Software');
const CRMLITE_URL = process.env.CRMLITE_URL || 'https://crmlite-h3k1s46jj-isaiahduprees-projects.vercel.app';
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8090';
// Comma-separated "port:name" pairs for the orchestrate service health probe.
const SAFARI_PORTS = (process.env.SAFARI_PORTS ||
  '3100:Instagram DM,3003:Twitter DM,3102:TikTok DM,3105:LinkedIn DM,3005:Instagram comments,3006:TikTok comments,3007:Twitter comments')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(pair => {
    const idx = pair.indexOf(':');
    return { port: parseInt(pair.slice(0, idx), 10), name: pair.slice(idx + 1).trim() };
  })
  .filter(p => !isNaN(p.port) && p.name);

// Anti-traversal slug guard, shared by every tool that maps a slug to a path.
const SLUG_RE = /^[a-zA-Z0-9_-]+$/;
function invalidSlug(slug) {
  if (!slug || !SLUG_RE.test(slug)) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Invalid slug: must be alphanumeric, hyphens, or underscores only` }) }] };
  }
  return null;
}

// Tolerant accessor for the monthly revenue target — schema has drifted between
// revenue.target_monthly_usd and revenue.monthly_target_usd across files.
function revenueTarget(goals) {
  const r = (goals && goals.revenue) || {};
  return r.target_monthly_usd ?? r.monthly_target_usd ?? 0;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'acd_list_projects',
    description: 'List all ACD projects and their feature completion status',
    inputSchema: {
      type: 'object',
      properties: {
        includeCompleted: { type: 'boolean' }
      },
      required: []
    }
  },
  {
    name: 'acd_start',
    description: 'Start an ACD harness run as a detached background process',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Project slug used for log/status naming' },
        promptPath: { type: 'string', description: 'Absolute path to .md PRD prompt file' },
        featureListPath: { type: 'string', description: 'Absolute path to features JSON file' },
        targetPath: { type: 'string', description: 'Absolute path to target repo (sets Claude cwd)' },
        model: { type: 'string', description: 'Claude model ID (default: claude-sonnet-4-6)' },
        fallbackModel: { type: 'string', description: 'Fallback model (default: claude-haiku-4-5-20251001)' },
        maxRetries: { type: 'number', description: 'Max consecutive errors (default: 3)' }
      },
      required: ['slug', 'promptPath', 'featureListPath', 'targetPath']
    }
  },
  {
    name: 'acd_status',
    description: 'Check the status of a running or completed ACD harness run',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Project slug to check' },
        featureListPath: { type: 'string', description: 'Optional: absolute path to features JSON for detailed breakdown' }
      },
      required: ['slug']
    }
  },
  {
    name: 'acd_logs',
    description: 'Read recent log output from a harness run',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        lines: { type: 'number', description: 'Number of lines to tail (default: 50)' }
      },
      required: ['slug']
    }
  },
  {
    name: 'acd_stop',
    description: 'Stop a running ACD harness process',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        force: { type: 'boolean', description: 'Use SIGKILL instead of SIGTERM (default: false)' }
      },
      required: ['slug']
    }
  },
  {
    name: 'acd_list_prds',
    description: 'List all PRD prompt files in harness/prompts/ with parsed frontmatter',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Optional filter by domain tag' }
      },
      required: []
    }
  },
  {
    name: 'acd_write_prd',
    description: 'Write a PRD markdown string to harness/prompts/{slug}.md',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'PRD slug (filename without .md)' },
        content: { type: 'string', description: 'PRD markdown content to write' },
        overwrite: { type: 'boolean', description: 'Allow overwriting existing file (default: false)' }
      },
      required: ['slug', 'content']
    }
  },
  {
    name: 'acd_generate_features',
    description: 'Read a PRD and use Claude haiku to auto-extract structured features.json',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'PRD slug' },
        prdPath: { type: 'string', description: 'Optional: override PRD path' },
        outputPath: { type: 'string', description: 'Optional: override output JSON path' }
      },
      required: ['slug']
    }
  },
  {
    name: 'acd_dispatch',
    description: 'End-to-end: write PRD + generate features + start harness in one call',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Project slug' },
        targetPath: { type: 'string', description: 'Absolute path to target repo (sets Claude cwd)' },
        prdContent: { type: 'string', description: 'Optional: PRD content to write' },
        model: { type: 'string', description: 'Claude model (default: claude-sonnet-4-6)' },
        overwritePrd: { type: 'boolean', description: 'Overwrite existing PRD (default: false)' }
      },
      required: ['slug', 'targetPath']
    }
  },
  {
    name: 'acd_list_running',
    description: 'List all ACD agents with live process status and completion percentage',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'acd_read_memory',
    description: 'Read context from all 3 memory layers: tacit knowledge (L3), today daily note (L2), top knowledge graph entities (L1)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional topic to filter graph entities' },
        layers: { type: 'array', items: { type: 'string' }, description: 'Which layers to read: [1,2,3] default all' }
      },
      required: []
    }
  },
  {
    name: 'acd_write_memory',
    description: 'Write a memory event to Layer 2 (actp_memory_events + daily note). Events with importance >= 7.0 promote to Layer 1 nightly.',
    inputSchema: {
      type: 'object',
      properties: {
        event_type: { type: 'string', description: 'decision | error | insight | observation | session_complete' },
        content: { type: 'string', description: 'What happened, what was built, what was decided' },
        importance_score: { type: 'number', description: '0-10. >= 7.0 promotes to Layer 1 nightly. 9-10=major decision, 7-8=significant feature, 5-6=normal work' },
        source: { type: 'string', description: 'Source agent identifier, e.g. acd-dispatch or claude_code' },
        metadata: { type: 'object', description: 'Optional: { slug, features_passed, features_total, files_changed }' }
      },
      required: ['event_type', 'content']
    }
  },
  {
    name: 'acd_heartbeat_status',
    description: 'Read latest heartbeat snapshots from Supabase and CRMLite agent/status endpoint',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'acd_schedule',
    description: 'Schedule a future ACD agent run. Writes a job entry to data/schedule.json that the scheduler daemon executes.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        targetPath: { type: 'string', description: 'Absolute path to target repo' },
        schedule: { type: 'string', description: 'Cadence: once | daily | weekly | cron (or a raw cron expression)' },
        cronExpr: { type: 'string', description: 'Cron expression when cadence is cron (e.g. "0 9 * * 1")' },
        runAt: { type: 'string', description: 'ISO 8601 datetime for once jobs (e.g. 2026-03-04T09:00:00Z)' },
        model: { type: 'string', description: 'Default: claude-sonnet-4-6' },
        enabled: { type: 'boolean', description: 'Default: true' }
      },
      required: ['slug', 'targetPath']
    }
  },
  {
    name: 'acd_list_scheduled',
    description: 'List all scheduled ACD agent runs from data/schedule.json with PID liveness check',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'acd_get_goals',
    description: 'Read the business goals file and return revenue targets, growth, weekly targets, next actions, agents in flight, and offers',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'acd_update_goals',
    description: 'Update a specific field in business-goals.json using dot-path notation',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Dot-path to field, e.g. revenue.current_monthly_usd or growth.crm_contacts_current' },
        value: { description: 'New value (any JSON type)' }
      },
      required: ['path', 'value']
    }
  },
  {
    name: 'acd_target_status',
    description: 'Get status of ALL targets (whole projects) under SOFTWARE_ROOT. A TARGET is a full project repo. A FEATURE is a unit of work within a target. Returns: target name, git activity, feature progress (features complete/total), Vercel deployment, ACD completion status. Reads hourly-cached report or fresh scan.',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Filter: active (last 7d) | recent (last 30d) | stale (>30d) | no-git | incomplete (has unfinished features) | building (ACD actively working) | done | untracked | all (default)' },
        refresh: { type: 'boolean', description: 'Force a fresh scan instead of cached report (~10s)' }
      },
      required: []
    }
  },
  {
    name: 'acd_orchestrate',
    description: 'Read business goals + live system state and return a ranked action plan for the next 24-48 hours',
    inputSchema: {
      type: 'object',
      properties: {
        focus: { type: 'string', description: 'Optional filter: revenue | content | agents | growth' }
      },
      required: []
    }
  },
  {
    name: 'acd_run_cycle',
    description: 'Trigger an autonomous ACTP execution cycle by posting to the worker. Cycles: morning (research+content+upwork+dm), twitter_feedback (checkbacks+classify+analyze), evening (metrics+schedule+crm), nightly (memory+strategy+heartbeat), once (ad-hoc single pass).',
    inputSchema: {
      type: 'object',
      properties: {
        cycle: { type: 'string', enum: ['morning', 'twitter_feedback', 'evening', 'nightly', 'once'], description: 'Which autonomous cycle to run' },
        niche: { type: 'string', description: 'Optional niche override (default: ai_automation)' },
        dry_run: { type: 'boolean', description: 'Log steps without executing (default: false)' }
      },
      required: ['cycle']
    }
  },
  {
    name: 'acd_parallel_plan',
    description: 'Generate 3 strategy variants for a decision type using ICP + offers from business-goals.json. Returns variants with scores and winner recommendation. Types: upwork, dm, tweet, content, offer.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['upwork', 'dm', 'tweet', 'content', 'offer'], description: 'Decision type to generate variants for' },
        niche: { type: 'string', description: 'Target niche (e.g. ai_automation, saas_growth)' },
        context: { type: 'string', description: 'Optional extra context to inject into variant generation' }
      },
      required: ['type']
    }
  },
  {
    name: 'acd_restart',
    description: 'Stop a running ACD harness process and immediately re-start it with the same PRD and features',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Project slug to restart' },
        targetPath: { type: 'string', description: 'Absolute path to target repo (required — used to re-launch)' },
        model: { type: 'string', description: 'Claude model (default: claude-sonnet-4-6)' },
        force: { type: 'boolean', description: 'Use SIGKILL for the stop phase (default: false)' }
      },
      required: ['slug', 'targetPath']
    }
  },
  {
    name: 'acd_prune_pids',
    description: 'Scan harness/pids/ for stale .pid files belonging to dead processes and remove them. Returns count pruned.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'acd_get_log_errors',
    description: 'Read a harness log and return only lines matching error/fail/exception patterns. Useful for diagnosing stuck or failed runs.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        lines: { type: 'number', description: 'Max error lines to return (default: 20)' }
      },
      required: ['slug']
    }
  },
  {
    name: 'acd_assess_all',
    description: 'Full assessment of ALL ACD projects — scans every prompt, feature file, log, and status file. Returns grouped summary: COMPLETE, IN_PROGRESS, NOT_STARTED, NO_FEATURES. Use group param to filter.',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Filter: all|complete|in_progress|not_started|no_features (default: all)' },
        format: { type: 'string', description: 'Output format: summary|table|json (default: summary)' }
      },
      required: []
    }
  },
  {
    name: 'acd_run_tests',
    description: 'Run the test suite for one or all projects (npm test / vitest / jest). Discovers test command from package.json. Returns pass/fail per project.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Project slug to test. Omit to test all projects with test scripts.' },
        targetPath: { type: 'string', description: 'Explicit path to project directory (overrides slug lookup)' },
        timeout: { type: 'number', description: 'Timeout per project in ms (default: 60000)' }
      },
      required: []
    }
  }
];

// ─── JSON-RPC helpers ────────────────────────────────────────────────────────

function sendResponse(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

// ─── Tool: acd_list_projects ─────────────────────────────────────────────────

function acdListProjects(params) {
  const projects = [];

  // Collect feature JSON files from the canonical data/features dir.
  const featureFiles = [];
  if (existsSync(FEATURES_DIR)) {
    try {
      for (const entry of readdirSync(FEATURES_DIR)) {
        if (entry.endsWith('.json')) featureFiles.push(join(FEATURES_DIR, entry));
      }
    } catch (e) {
      console.error('Error reading dir:', FEATURES_DIR, e.message);
    }
  }

  // Read parallel-status.json for running pids
  let parallelStatus = null;
  const parallelStatusPath = join(METRICS_DIR, 'parallel-status.json');
  if (existsSync(parallelStatusPath)) {
    try {
      parallelStatus = JSON.parse(readFileSync(parallelStatusPath, 'utf8'));
    } catch (e) {
      console.error('Error reading parallel-status.json:', e.message);
    }
  }

  for (const filePath of featureFiles) {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      const features = Array.isArray(data.features) ? data.features : [];
      const total = features.length;
      const passing = features.filter(f => f.passes === true).length;
      const percentComplete = total > 0 ? Math.round((passing / total) * 100) : 0;

      // Optionally skip completed projects
      if (params.includeCompleted === false && percentComplete === 100) continue;

      const slug = data.project || basename(filePath, '.json').replace(/-features$/, '');

      // Check pid from pids dir
      let pid = null;
      const pidFile = join(PIDS_DIR, `${slug}.pid`);
      if (existsSync(pidFile)) {
        try { pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10); } catch (_) {}
      }

      // Also check parallel-status workers
      if (!pid && parallelStatus && parallelStatus.workers) {
        const worker = Object.values(parallelStatus.workers).find(w => w.slug === slug);
        if (worker) pid = worker.pid || null;
      }

      projects.push({
        project: slug,
        description: data.description || '',
        total,
        passing,
        percentComplete,
        featureListPath: filePath,
        pid: pid || null
      });
    } catch (e) {
      console.error('Error parsing feature file:', filePath, e.message);
    }
  }

  return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
}

// ─── Tool: acd_start ─────────────────────────────────────────────────────────

function acdStart(params) {
  const { slug, promptPath, featureListPath, targetPath, model, fallbackModel, maxRetries } = params;

  // Guard against path traversal via slug
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Invalid slug: must be alphanumeric, hyphens, or underscores only` }) }] };
  }

  // Validate required paths
  for (const [name, p] of [
    ['promptPath', promptPath],
    ['featureListPath', featureListPath],
    ['targetPath', targetPath]
  ]) {
    if (!existsSync(p)) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `${name} does not exist: ${p}` }) }] };
    }
  }

  // Ensure directories exist
  mkdirSync(LOGS_DIR, { recursive: true });
  mkdirSync(PIDS_DIR, { recursive: true });

  const logFile = join(LOGS_DIR, `${slug}.log`);
  const pidFile = join(PIDS_DIR, `${slug}.pid`);

  const args = [
    join(ENGINE_DIR, 'run-harness-v2.js'),
    `--path=${targetPath}`,
    `--project=${slug}`,
    `--prompt=${promptPath}`,
    `--feature-list=${featureListPath}`,
    `--model=${model || 'claude-sonnet-4-6'}`,
    `--fallback-model=${fallbackModel || 'claude-haiku-4-5-20251001'}`,
    `--max-retries=${maxRetries !== undefined ? maxRetries : 3}`,
    '--adaptive-delay',
    '--force-coding',
    '--until-complete'
  ];

  // spawn() requires stream stdio entries to have an open file descriptor.
  // createWriteStream() opens asynchronously, which made acd_start race and
  // fail with ERR_INVALID_ARG_VALUE before every harness launch.
  const logFd = openSync(logFile, 'a');
  let child;
  try {
    child = spawn('node', args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: ACD_ROOT
    });
  } finally {
    closeSync(logFd);
  }

  child.unref();

  try {
    writeFileSync(pidFile, String(child.pid));
  } catch (e) {
    console.error('Error writing pid file:', e.message);
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ started: true, pid: child.pid, slug, logFile })
    }]
  };
}

// ─── Tool: acd_status ────────────────────────────────────────────────────────

function acdStatus(params) {
  const { slug, featureListPath } = params;
  const bad = invalidSlug(slug);
  if (bad) return bad;

  // Read harness status JSON (slug-specific first, then generic)
  let status = null;
  const statusCandidates = [
    join(METRICS_DIR, `harness-status-${slug}.json`),
    join(METRICS_DIR, 'harness-status.json')
  ];
  for (const sp of statusCandidates) {
    if (existsSync(sp)) {
      try { status = JSON.parse(readFileSync(sp, 'utf8')); break; } catch (_) {}
    }
  }

  // Check running status from pid file
  let pid = null;
  let isRunning = false;
  const pidFile = join(PIDS_DIR, `${slug}.pid`);
  if (existsSync(pidFile)) {
    try {
      pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
      try {
        process.kill(pid, 0);
        isRunning = true;
      } catch (_) {
        isRunning = false;
      }
    } catch (_) {}
  }

  // Feature breakdown (if path provided)
  let features = null;
  if (featureListPath && existsSync(featureListPath)) {
    try {
      const data = JSON.parse(readFileSync(featureListPath, 'utf8'));
      const all = Array.isArray(data.features) ? data.features : [];
      features = {
        total: all.length,
        passing: all.filter(f => f.passes).length,
        pending: all.filter(f => !f.passes && f.status !== 'in_progress').length,
        inProgress: all.filter(f => f.status === 'in_progress').length,
        items: all.map(f => ({ id: f.id, name: f.name, passes: f.passes, status: f.status }))
      };
    } catch (_) {}
  }

  // Recent log lines
  let recentLog = [];
  const logFile = join(LOGS_DIR, `${slug}.log`);
  if (existsSync(logFile)) {
    try {
      const content = readFileSync(logFile, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      recentLog = lines.slice(-5);
    } catch (_) {}
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ status, isRunning, pid, stats: status && status.stats ? status.stats : null, recentLog, features })
    }]
  };
}

// ─── Tool: acd_logs ──────────────────────────────────────────────────────────

function acdLogs(params) {
  const { slug, lines = 50 } = params;
  const bad = invalidSlug(slug);
  if (bad) return bad;
  const logFile = join(LOGS_DIR, `${slug}.log`);

  if (!existsSync(logFile)) {
    return { content: [{ type: 'text', text: `Log file not found: ${logFile}` }] };
  }

  try {
    const stat = statSync(logFile);
    // Read last 32KB max — avoids loading multi-MB log files into memory
    const chunkSize = Math.min(stat.size, 32768);
    let text;
    if (chunkSize === 0) {
      text = '';
    } else {
      const fd = openSync(logFile, 'r');
      const buf = Buffer.alloc(chunkSize);
      readSync(fd, buf, 0, chunkSize, stat.size - chunkSize);
      closeSync(fd);
      const chunk = buf.toString('utf8');
      const allLines = chunk.split('\n');
      // Drop first line if we didn't start from byte 0 (may be a partial line)
      const startFrom = stat.size > chunkSize ? 1 : 0;
      text = allLines.slice(startFrom).slice(-lines).join('\n');
    }
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error reading log: ${e.message}` }] };
  }
}

// ─── Tool: acd_list_prds ─────────────────────────────────────────────────────

function acdListPrds(params) {
  if (!existsSync(PRDS_DIR)) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `PRD directory not found: ${PRDS_DIR}` }) }] };
  }

  const prds = [];
  try {
    const entries = readdirSync(PRDS_DIR);
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;

      const filePath = join(PRDS_DIR, entry);
      const slug = basename(entry, '.md');
      const stats = statSync(filePath);

      // Read first 20 lines to parse frontmatter
      let domain = null;
      let priority = null;
      let description = null;

      try {
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n').slice(0, 20);

        // Check for YAML frontmatter
        if (lines[0] && lines[0].trim() === '---') {
          const endIndex = lines.slice(1).findIndex(l => l.trim() === '---');
          if (endIndex > 0) {
            const frontmatter = lines.slice(1, endIndex + 1);
            for (const line of frontmatter) {
              const match = line.match(/^(\w+):\s*(.+)$/);
              if (match) {
                const [, key, value] = match;
                if (key === 'domain') domain = value.trim();
                if (key === 'priority') priority = parseInt(value.trim(), 10) || null;
                if (key === 'description') description = value.trim();
              }
            }
          }
        }
      } catch (e) {
        // Ignore parse errors for individual files
      }

      // Filter by domain if provided
      if (params.domain && domain !== params.domain) continue;

      prds.push({
        slug,
        domain,
        priority,
        description,
        path: filePath,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      });
    }
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Error reading prompts: ${e.message}` }) }] };
  }

  return { content: [{ type: 'text', text: JSON.stringify(prds, null, 2) }] };
}

// ─── Tool: acd_write_prd ─────────────────────────────────────────────────────

function acdWritePrd(params) {
  const { slug, content, overwrite = false } = params;
  const bad = invalidSlug(slug);
  if (bad) return bad;
  mkdirSync(PRDS_DIR, { recursive: true });

  const filePath = prdFile(slug);
  const existed = existsSync(filePath);

  if (existed && !overwrite) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'FILE_EXISTS', path: filePath, message: 'File exists. Use overwrite: true to replace.' })
      }]
    };
  }

  try {
    writeFileSync(filePath, content, 'utf8');
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          slug,
          path: filePath,
          bytesWritten: content.length,
          created: !existed
        })
      }]
    };
  } catch (e) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Failed to write PRD: ${e.message}` })
      }]
    };
  }
}

// ─── Tool: acd_generate_features ─────────────────────────────────────────────

async function acdGenerateFeatures(params) {
  const { slug, prdPath: customPrdPath, outputPath: customOutputPath } = params;
  const bad = invalidSlug(slug);
  if (bad) return bad;

  const prdPath = customPrdPath || prdFile(slug);
  const outputPath = customOutputPath || featureFile(slug);

  // Read PRD content
  if (!existsSync(prdPath)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'PRD_NOT_FOUND', path: prdPath })
      }]
    };
  }

  let prdContent;
  try {
    prdContent = readFileSync(prdPath, 'utf8');
  } catch (e) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Failed to read PRD: ${e.message}` })
      }]
    };
  }

  // Get API key from environment
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in environment' })
      }]
    };
  }

  // Build Claude prompt
  const idPrefix = slug.toUpperCase();
  const systemPrompt = 'You are a feature extraction expert. Extract discrete, independently testable features from PRDs. Return ONLY valid JSON.';
  const userPrompt = `Extract features from this PRD and return a JSON object with this exact structure:

{
  "project": "${slug}",
  "version": "1.0.0",
  "description": "Brief project summary",
  "features": [
    {
      "id": "${idPrefix}-001",
      "name": "Feature name with acceptance criterion (under 120 chars)",
      "category": "api | database | ui | integration | testing | config | mcp | skill | backend",
      "priority": 1,
      "passes": false,
      "status": "pending"
    }
  ]
}

Rules:
- IDs: ${idPrefix}-001, ${idPrefix}-002, etc.
- category: api, database, ui, integration, testing, config, mcp, skill, or backend
- priority: 1 (blocking), 2 (core), 3 (enhancement)
- name: what to build + acceptance criterion, under 120 chars
- All features start with passes: false, status: "pending"

PRD Content:
${prdContent}`;

  // Call Claude API
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: `Claude API error: ${response.status} ${errorText}` })
        }]
      };
    }

    const result = await response.json();
    const content = result.content?.[0]?.text;

    if (!content) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'No content in Claude response' })
        }]
      };
    }

    // Parse JSON from response — strip markdown code fences if present
    let featuresData;
    try {
      let cleanContent = content.trim();
      const fenceMatch = cleanContent.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
      if (fenceMatch) cleanContent = fenceMatch[1].trim();
      featuresData = JSON.parse(cleanContent);
    } catch (e) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: `Failed to parse Claude response as JSON: ${e.message}`, rawResponse: content })
        }]
      };
    }

    // Ensure output directory exists
    mkdirSync(dirname(outputPath), { recursive: true });

    // Write to file
    writeFileSync(outputPath, JSON.stringify(featuresData, null, 2), 'utf8');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          slug,
          count: featuresData.features?.length || 0,
          path: outputPath,
          features: featuresData.features || []
        })
      }]
    };
  } catch (e) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Claude API call failed: ${e.message}` })
      }]
    };
  }
}

// ─── Tool: acd_dispatch ──────────────────────────────────────────────────────

async function acdDispatch(params) {
  const { slug, targetPath, prdContent, model, overwritePrd = false } = params;
  const bad = invalidSlug(slug);
  if (bad) return bad;

  // Step 1: Write PRD if content provided
  if (prdContent) {
    const writeResult = acdWritePrd({ slug, content: prdContent, overwrite: overwritePrd });
    const writeData = JSON.parse(writeResult.content[0].text);
    if (writeData.error) {
      return writeResult;
    }
  }

  // Step 2: Check PRD exists
  const prdPath = prdFile(slug);
  if (!existsSync(prdPath)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'PRD_NOT_FOUND',
          message: 'Provide prdContent or call acd_write_prd first',
          prdPath
        })
      }]
    };
  }

  // Step 3: Generate features
  const featuresResult = await acdGenerateFeatures({ slug });
  const featuresData = JSON.parse(featuresResult.content[0].text);

  if (featuresData.error) {
    return featuresResult;
  }

  const featureListPath = featuresData.path;
  const featuresGenerated = featuresData.count;

  // Step 4: Start harness
  const startResult = acdStart({
    slug,
    promptPath: prdPath,
    featureListPath,
    targetPath,
    model: model || 'claude-sonnet-4-6'
  });

  const startData = JSON.parse(startResult.content[0].text);

  if (startData.error) {
    return startResult;
  }

  // Step 5: Return combined result
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        slug,
        pid: startData.pid,
        logFile: startData.logFile,
        featuresGenerated,
        prdPath,
        featureListPath,
        targetPath
      })
    }]
  };
}

// ─── Tool: acd_list_running ──────────────────────────────────────────────────

function acdListRunning() {
  const runningAgents = [];
  const pids = new Set();

  // Collect PIDs from pids directory
  if (existsSync(PIDS_DIR)) {
    try {
      const pidFiles = readdirSync(PIDS_DIR);
      for (const file of pidFiles) {
        if (!file.endsWith('.pid')) continue;
        const slug = basename(file, '.pid');
        const pidFile = join(PIDS_DIR, file);
        try {
          const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
          if (!isNaN(pid)) {
            pids.add(JSON.stringify({ slug, pid, source: 'pidfile' }));
          }
        } catch (e) {
          // Ignore unreadable pid files
        }
      }
    } catch (e) {
      console.error('Error reading pids directory:', e.message);
    }
  }

  // Collect PIDs from parallel-status.json
  const parallelStatusPath = join(METRICS_DIR, 'parallel-status.json');
  if (existsSync(parallelStatusPath)) {
    try {
      const parallelStatus = JSON.parse(readFileSync(parallelStatusPath, 'utf8'));
      if (parallelStatus.workers) {
        for (const worker of Object.values(parallelStatus.workers)) {
          if (worker.slug && worker.pid) {
            pids.add(JSON.stringify({ slug: worker.slug, pid: worker.pid, source: 'parallel-status' }));
          }
        }
      }
    } catch (e) {
      console.error('Error reading parallel-status.json:', e.message);
    }
  }

  // Process each unique slug/pid combination
  for (const pidStr of pids) {
    const { slug, pid } = JSON.parse(pidStr);

    // Check process liveness
    let isRunning = false;
    try {
      process.kill(pid, 0);
      isRunning = true;
    } catch (e) {
      isRunning = false;
    }

    // Find matching feature JSON
    let passed = 0;
    let total = 0;
    let percentComplete = 0;

    const featurePath = featureFile(slug);
    if (existsSync(featurePath)) {
      try {
        const data = JSON.parse(readFileSync(featurePath, 'utf8'));
        const features = Array.isArray(data.features) ? data.features : [];
        total = features.length;
        passed = features.filter(f => f.passes === true).length;
        percentComplete = total > 0 ? Math.round((passed / total) * 100) : 0;
      } catch (e) {
        // Ignore parse errors
      }
    }

    const logFile = join(LOGS_DIR, `${slug}.log`);

    runningAgents.push({
      slug,
      pid,
      isRunning,
      passed,
      total,
      percentComplete,
      logFile: existsSync(logFile) ? logFile : null
    });
  }

  // Sort by percentComplete descending
  runningAgents.sort((a, b) => b.percentComplete - a.percentComplete);

  return { content: [{ type: 'text', text: JSON.stringify(runningAgents, null, 2) }] };
}

// ─── Tool: acd_read_memory ───────────────────────────────────────────────────

async function acdReadMemory(params) {
  const { query, layers } = params;
  const vaultPath = process.env.MEMORY_VAULT_PATH || join(os.homedir(), '.memory', 'vault');
  const result = { layers: {} };

  // Layer 3: Tacit Knowledge
  const tacitPath = join(vaultPath, 'TACIT-KNOWLEDGE.md');
  if (existsSync(tacitPath)) {
    try {
      const content = readFileSync(tacitPath, 'utf8');
      result.layers[3] = {
        content: content.substring(0, 2000),
        source: tacitPath,
        fullLength: content.length
      };
    } catch (e) {
      result.layers[3] = { error: e.message };
    }
  } else {
    result.layers[3] = { error: 'TACIT-KNOWLEDGE.md not found' };
  }

  // Layer 2: Daily Notes (today and yesterday)
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const formatDate = (d) => d.toISOString().split('T')[0];
  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(yesterday);

  const dailyNotesDir = join(vaultPath, 'DAILY-NOTES');
  const todayPath = join(dailyNotesDir, `${todayStr}.md`);
  const yesterdayPath = join(dailyNotesDir, `${yesterdayStr}.md`);

  result.layers[2] = { date: todayStr };
  if (existsSync(todayPath)) {
    try {
      result.layers[2].today = readFileSync(todayPath, 'utf8');
    } catch (e) {
      result.layers[2].todayError = e.message;
    }
  }
  if (existsSync(yesterdayPath)) {
    try {
      result.layers[2].yesterday = readFileSync(yesterdayPath, 'utf8');
    } catch (e) {
      result.layers[2].yesterdayError = e.message;
    }
  }

  // Layer 1: Knowledge Graph Entities (from Supabase)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      let url = `${supabaseUrl}/rest/v1/actp_graph_entities?select=name,entity_type,properties,tags,confidence,layer&order=updated_at.desc&limit=15`;
      if (query) {
        url += `&name=ilike.*${encodeURIComponent(query)}*`;
      }
      const response = await fetch(url, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        signal: AbortSignal.timeout(10000)
      });
      if (response.ok) {
        const data = await response.json();
        result.layers[1] = { entities: data, count: data.length };
      } else {
        result.layers[1] = { error: `Supabase query failed: ${response.status}` };
      }
    } catch (e) {
      result.layers[1] = { error: e.message };
    }
  } else {
    result.layers[1] = { error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set' };
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

// ─── Tool: acd_write_memory ──────────────────────────────────────────────────

async function acdWriteMemory(params) {
  const { event_type, content, importance_score = 5.0, source = 'acd', metadata = {} } = params;

  const vaultPath = process.env.MEMORY_VAULT_PATH || join(os.homedir(), '.memory', 'vault');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const result = { ok: false };

  // Write to Supabase actp_memory_events
  if (supabaseUrl && supabaseKey) {
    try {
      const payload = {
        event_type,
        content,
        importance_score,
        source,
        metadata,
        created_at: new Date().toISOString()
      };

      const response = await fetch(`${supabaseUrl}/rest/v1/actp_memory_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        result.supabaseError = `Failed to write to Supabase: ${response.status}`;
      } else {
        result.supabaseWritten = true;
      }
    } catch (e) {
      result.supabaseError = e.message;
    }
  } else {
    result.supabaseError = 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set';
  }

  // Append to today's daily note
  const today = new Date().toISOString().split('T')[0];
  const dailyNotesDir = join(vaultPath, 'DAILY-NOTES');
  const dailyNotePath = join(dailyNotesDir, `${today}.md`);

  try {
    mkdirSync(dailyNotesDir, { recursive: true });

    const timestamp = new Date().toTimeString().split(' ')[0].substring(0, 5); // HH:MM
    const entry = `\n## ACD Event: ${timestamp}\n**Type:** ${event_type}\n**Score:** ${importance_score}\n${content}\n`;

    writeFileSync(dailyNotePath, entry, { flag: 'a', encoding: 'utf8' });
    result.dailyNoteWritten = true;
    result.notePath = dailyNotePath;
  } catch (e) {
    result.dailyNoteError = e.message;
  }

  result.ok = result.supabaseWritten || result.dailyNoteWritten;
  result.eventType = event_type;
  result.importanceScore = importance_score;
  result.promotesNightly = importance_score >= 7.0;

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

// ─── Tool: acd_heartbeat_status ──────────────────────────────────────────────

async function acdHeartbeatStatus() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = {};

  // Query Supabase for last 3 health snapshots
  if (supabaseUrl && supabaseKey) {
    try {
      const url = `${supabaseUrl}/rest/v1/actp_agent_health_snapshots?select=*&order=created_at.desc&limit=3`;
      const response = await fetch(url, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (response.ok) {
        const snapshots = await response.json();
        result.snapshots = snapshots;
        if (snapshots.length > 0) {
          result.lastHeartbeatAt = snapshots[0].created_at;
          result.servicesUp = snapshots[0].services_up;
          result.servicesTotal = snapshots[0].services_total;
        }
      } else {
        result.snapshotsError = `Supabase query failed: ${response.status}`;
      }
    } catch (e) {
      result.snapshotsError = e.message;
    }
  } else {
    result.snapshotsError = 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set';
  }

  // Fetch CRMLite agent status (with 5s timeout)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${CRMLITE_URL}/api/agent/status`, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      result.crmliteStatus = await response.json();
    } else {
      result.crmliteStatus = null;
      result.crmliteError = `HTTP ${response.status}`;
    }
  } catch (e) {
    result.crmliteStatus = null;
    result.crmliteError = e.name === 'AbortError' ? 'Timeout after 5s' : e.message;
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

// ─── Tool: acd_schedule ──────────────────────────────────────────────────────

// Normalize the freeform `schedule` input into a canonical cadence + cronExpr.
function normalizeCadence(schedule, cronExpr) {
  const s = String(schedule || 'once').trim().toLowerCase();
  if (s === 'once' || s === 'daily' || s === 'weekly') return { cadence: s, cronExpr: cronExpr || null };
  if (s === 'cron') return { cadence: 'cron', cronExpr: cronExpr || null };
  // A raw cron expression was passed in the `schedule` field (5/6 space-separated fields).
  if (/^[\d*\/,\-? ]+$/.test(schedule) && String(schedule).trim().split(/\s+/).length >= 5) {
    return { cadence: 'cron', cronExpr: String(schedule).trim() };
  }
  return { cadence: 'once', cronExpr: cronExpr || null };
}

// Compute the next run time (ISO) for a job. Cron jobs are left for the
// daemon to resolve (it owns cron parsing); we record null in that case.
function computeNextRun(cadence, runAt, from = new Date()) {
  if (cadence === 'once') return runAt || null;
  if (cadence === 'daily') {
    const d = new Date(from); d.setDate(d.getDate() + 1); return d.toISOString();
  }
  if (cadence === 'weekly') {
    const d = new Date(from); d.setDate(d.getDate() + 7); return d.toISOString();
  }
  return null; // cron — daemon resolves from cronExpr
}

function acdSchedule(params) {
  const { slug, targetPath, schedule = 'once', cronExpr, runAt, model = 'claude-sonnet-4-6', enabled = true } = params;
  const bad = invalidSlug(slug);
  if (bad) return bad;

  // Read or initialize schedule
  let scheduleData = { jobs: [] };
  if (existsSync(SCHEDULE_FILE)) {
    try {
      scheduleData = JSON.parse(readFileSync(SCHEDULE_FILE, 'utf8'));
      if (!Array.isArray(scheduleData.jobs)) {
        scheduleData.jobs = [];
      }
    } catch (e) {
      // Start fresh if parse fails
      scheduleData = { jobs: [] };
    }
  }

  // Remove any existing job with the same slug (replace)
  scheduleData.jobs = scheduleData.jobs.filter(j => j.slug !== slug);

  const now = new Date();
  const { cadence, cronExpr: normCron } = normalizeCadence(schedule, cronExpr);
  const nextRun = computeNextRun(cadence, runAt, now);

  // Daemon-executable job shape (engine/scheduler.js reads this file).
  const job = {
    id: `${slug}-${now.getTime()}`,
    slug,
    cadence,
    cronExpr: normCron,
    runAt: cadence === 'once' ? (runAt || null) : null,
    repoPath: targetPath,
    model,
    enabled,
    createdAt: now.toISOString(),
    lastRun: null,
    nextRun,
    // Convenience paths the daemon can hand straight to acd_start.
    promptPath: prdFile(slug),
    featureListPath: featureFile(slug)
  };

  scheduleData.jobs.push(job);

  // Write back
  try {
    mkdirSync(dirname(SCHEDULE_FILE), { recursive: true });
    writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduleData, null, 2), 'utf8');
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          job,
          schedulePath: SCHEDULE_FILE,
          totalJobs: scheduleData.jobs.length
        })
      }]
    };
  } catch (e) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Failed to write schedule: ${e.message}` })
      }]
    };
  }
}

// ─── Tool: acd_list_scheduled ────────────────────────────────────────────────

function acdListScheduled() {
  if (!existsSync(SCHEDULE_FILE)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ jobs: [], pending: 0, running: 0, disabled: 0 })
      }]
    };
  }

  let scheduleData;
  try {
    scheduleData = JSON.parse(readFileSync(SCHEDULE_FILE, 'utf8'));
  } catch (e) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Failed to read schedule: ${e.message}` })
      }]
    };
  }

  const jobs = Array.isArray(scheduleData.jobs) ? scheduleData.jobs : [];
  const enrichedJobs = [];
  let pendingCount = 0;
  let runningCount = 0;
  let disabledCount = 0;

  const now = new Date();

  for (const job of jobs) {
    const { slug } = job;
    let status = 'unknown';
    let pid = null;
    let isRunning = false;

    // Check for running process
    const pidFile = join(PIDS_DIR, `${slug}.pid`);
    if (existsSync(pidFile)) {
      try {
        pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
        if (!isNaN(pid)) {
          try {
            process.kill(pid, 0);
            isRunning = true;
            status = 'running';
            runningCount++;
          } catch (e) {
            // Process not running
          }
        }
      } catch (e) {
        // Ignore read errors
      }
    }

    if (!isRunning) {
      if (job.enabled === false) {
        status = 'disabled';
        disabledCount++;
      } else if (!job.promptPath || !existsSync(job.promptPath)) {
        status = 'no-prompt';
      } else if (job.runAt) {
        const runAt = new Date(job.runAt);
        if (runAt > now) {
          status = 'pending';
          pendingCount++;
        } else {
          status = 'overdue';
        }
      } else {
        status = 'pending';
        pendingCount++;
      }
    }

    enrichedJobs.push({
      ...job,
      status,
      pid: isRunning ? pid : null,
      promptExists: !!job.promptPath && existsSync(job.promptPath),
      featureListExists: !!job.featureListPath && existsSync(job.featureListPath)
    });
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ jobs: enrichedJobs, pending: pendingCount, running: runningCount, disabled: disabledCount }, null, 2)
    }]
  };
}

// ─── Tool: acd_stop ──────────────────────────────────────────────────────────

function acdStop(params) {
  const { slug, force = false } = params;
  const bad = invalidSlug(slug);
  if (bad) return bad;
  const pidFile = join(PIDS_DIR, `${slug}.pid`);

  if (!existsSync(pidFile)) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `No pid file found for ${slug}` }) }] };
  }

  let pid;
  try {
    pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Cannot read pid file: ${e.message}` }) }] };
  }

  const signal = force ? 'SIGKILL' : 'SIGTERM';
  try {
    process.kill(pid, signal);
  } catch (e) {
    if (e.code === 'ESRCH') {
      try { unlinkSync(pidFile); } catch (_) {}
      return { content: [{ type: 'text', text: JSON.stringify({ stopped: false, pid, signal, note: 'Process was not running' }) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to kill process: ${e.message}` }) }] };
  }

  try { unlinkSync(pidFile); } catch (_) {}
  return { content: [{ type: 'text', text: JSON.stringify({ stopped: true, pid, signal }) }] };
}

// ─── Tool: acd_get_goals ─────────────────────────────────────────────────────

function acdGetGoals() {
  const goalsPath = GOALS_PATH;

  if (!existsSync(goalsPath)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'business-goals.json not found at ' + goalsPath })
      }]
    };
  }

  try {
    const goals = JSON.parse(readFileSync(goalsPath, 'utf8'));

    // Compute gap analysis (tolerant of revenue.target_monthly_usd vs monthly_target_usd)
    const target = revenueTarget(goals);
    const current = goals.revenue.current_monthly_usd || 0;
    const revenue_gap = target - current;
    const revenue_pct = target > 0 ? Math.round((current / target) * 100) : 0;
    const contacts_gap = goals.growth.crm_contacts_target - goals.growth.crm_contacts_current;

    const result = {
      goals,
      computed: {
        revenue_gap,
        revenue_pct,
        contacts_gap
      },
      updated: goals._updated
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Failed to read goals: ${e.message}` })
      }]
    };
  }
}

// ─── Tool: acd_update_goals ──────────────────────────────────────────────────

function acdUpdateGoals(params) {
  const { path, value } = params;
  const goalsPath = GOALS_PATH;

  if (!existsSync(goalsPath)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'business-goals.json not found at ' + goalsPath })
      }]
    };
  }

  try {
    const goals = JSON.parse(readFileSync(goalsPath, 'utf8'));

    // Deep-set using path split by '.'
    function deepSet(obj, pathParts, value) {
      if (pathParts.length === 1) {
        obj[pathParts[0]] = value;
      } else {
        const key = pathParts[0];
        if (!obj[key] || typeof obj[key] !== 'object') {
          obj[key] = {};
        }
        deepSet(obj[key], pathParts.slice(1), value);
      }
    }

    const pathParts = path.split('.');
    deepSet(goals, pathParts, value);

    // Update timestamp
    goals._updated = new Date().toISOString().split('T')[0];

    // Write back to file
    writeFileSync(goalsPath, JSON.stringify(goals, null, 2), 'utf8');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          path,
          newValue: value,
          updated: goals._updated
        })
      }]
    };
  } catch (e) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Failed to update goals: ${e.message}` })
      }]
    };
  }
}

// ─── Tool: acd_orchestrate ───────────────────────────────────────────────────

async function acdOrchestrate(params) {
  const { focus } = params;
  const goalsPath = GOALS_PATH;

  // 1. Read business goals
  let goals;
  try {
    goals = JSON.parse(readFileSync(goalsPath, 'utf8'));
  } catch (e) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Failed to read goals: ${e.message}` })
      }]
    };
  }

  // 2. Read current agent statuses
  const agentStatuses = {};
  if (existsSync(LOGS_DIR)) {
    const logFiles = readdirSync(LOGS_DIR).filter(f => f.endsWith('.log'));
    for (const logFile of logFiles) {
      const slug = basename(logFile, '.log');
      try {
        const content = readFileSync(join(LOGS_DIR, logFile), 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1] || '';
        agentStatuses[slug] = lastLine.includes('completed') ? 'completed' :
                               lastLine.includes('error') ? 'failed' :
                               lastLine.includes('Starting') ? 'starting' : 'running';
      } catch (e) {
        agentStatuses[slug] = 'unknown';
      }
    }
  }

  // 3. Check service health (port list is env-overridable via SAFARI_PORTS)
  const serviceHealth = {};
  const portsToCheck = SAFARI_PORTS;

  for (const { port, name } of portsToCheck) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`http://localhost:${port}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      serviceHealth[name] = response.ok;
    } catch (e) {
      serviceHealth[name] = false;
    }
  }

  const anyDmServiceUp = serviceHealth['Instagram DM'] || serviceHealth['Twitter DM'] ||
                         serviceHealth['TikTok DM'] || serviceHealth['LinkedIn DM'];
  const anyCommentServiceUp = serviceHealth['Instagram comments'] ||
                               serviceHealth['TikTok comments'] ||
                               serviceHealth['Twitter comments'];

  // 4. Build action catalog (tolerant of revenue target schema drift)
  const _target = revenueTarget(goals);
  const _current = (goals.revenue && goals.revenue.current_monthly_usd) || 0;
  const revenue_gap = _target - _current;
  const revenue_pct = _target > 0 ? Math.round((_current / _target) * 100) : 0;

  const actions = [];

  if (revenue_gap > 0) {
    actions.push({
      rank: 1,
      action: 'Submit Upwork proposals',
      skill: '/upwork-hunt',
      reason: `Revenue gap $${revenue_gap} - target ${goals.growth.upwork_proposals_per_week} proposals/week`,
      expected_impact: '2-5 client responses within 48hrs',
      blocked_by: null,
      can_run: true
    });
  }

  actions.push({
    rank: 2,
    action: 'LinkedIn DM campaign',
    skill: '/dm-campaign',
    reason: 'Top outreach channel for ICP (founders, operators)',
    expected_impact: '3-5 replies from qualified prospects',
    blocked_by: serviceHealth['LinkedIn DM'] ? null : 'LinkedIn DM service down',
    can_run: serviceHealth['LinkedIn DM'] === true
  });

  actions.push({
    rank: 3,
    action: 'Triage DM inbox',
    skill: '/social-inbox',
    reason: 'Reply to incoming leads across all platforms',
    expected_impact: '1-2 conversions to discovery calls',
    blocked_by: anyDmServiceUp ? null : 'All DM services down',
    can_run: anyDmServiceUp
  });

  actions.push({
    rank: 4,
    action: 'Twitter feedback cycle',
    skill: '/actp-pipeline twitter',
    reason: 'Audience growth + brand visibility (target: 3 posts/day)',
    expected_impact: 'Viral/strong tweet with 500+ impressions',
    blocked_by: null,
    can_run: true
  });

  actions.push({
    rank: 5,
    action: 'Comment on trending posts',
    skill: '/comment-sweep',
    reason: 'Inbound discovery via strategic comments',
    expected_impact: '+10-20 profile visits, 2-3 new followers',
    blocked_by: anyCommentServiceUp ? null : 'All comment services down',
    can_run: anyCommentServiceUp
  });

  // 5. Filter by focus if provided
  let filteredActions = actions;
  if (focus) {
    const focusMap = {
      revenue: [1, 2, 3], // Upwork, DM campaign, Social inbox
      content: [4, 5],    // Twitter, Comment sweep
      agents: [],         // Would check agent statuses
      growth: [2, 3, 5]   // DM campaign, Social inbox, Comment sweep
    };
    const relevantRanks = focusMap[focus] || [];
    if (relevantRanks.length > 0) {
      filteredActions = actions.filter(a => relevantRanks.includes(a.rank));
    }
  }

  // 6. Sort by rank (blocked actions go to end)
  filteredActions.sort((a, b) => {
    if (a.can_run && !b.can_run) return -1;
    if (!a.can_run && b.can_run) return 1;
    return a.rank - b.rank;
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        plan: filteredActions,
        goals_summary: {
          revenue_gap,
          revenue_pct,
          focus: focus || 'all'
        },
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  };
}

// ─── Tool: acd_run_cycle ──────────────────────────────────────────────────────

const CYCLE_STEPS = {
  morning:          ['twitter_research_weekly', 'twitter_daily_generation', 'dm_outreach_session', 'upwork_proposal_batch'],
  twitter_feedback: ['twitter_feedback_cycle', 'twitter_metrics_collection'],
  evening:          ['review_metrics', 'content_schedule', 'twitter_feedback_cycle'],
  nightly:          ['memory_promotion', 'twitter_playbook_refresh', 'keyword_research_trigger'],
  once:             ['twitter_daily_generation']
};

async function acdRunCycle(params) {
  const { cycle, niche = 'ai_automation', dry_run = false } = params;
  const steps = CYCLE_STEPS[cycle];
  if (!steps) throw new Error(`Unknown cycle: ${cycle}. Valid: ${Object.keys(CYCLE_STEPS).join(', ')}`);

  const startMs = Date.now();
  const results = [];
  const errors = [];
  mkdirSync(LOGS_DIR, { recursive: true });
  const logPath = join(LOGS_DIR, 'actp-autonomous-cycle.log');

  const logLine = (msg) => {
    const line = `[${new Date().toISOString()}] [${cycle}] ${msg}\n`;
    try { appendFileSync(logPath, line); } catch (e) {}
  };

  logLine(`Starting cycle: ${cycle} | niche: ${niche} | dry_run: ${dry_run} | steps: ${steps.join(', ')}`);

  for (const step of steps) {
    if (dry_run) {
      results.push({ step, status: 'dry_run', skipped: true });
      logLine(`[DRY] would run: ${step}`);
      continue;
    }
    try {
      const resp = await fetch(`${WORKER_URL}/api/services/cron/${step}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': process.env.WORKER_SECRET || '' },
        body: JSON.stringify({ niche, triggered_by: 'acd_run_cycle' }),
        signal: AbortSignal.timeout(30000)
      });
      const body = resp.ok ? await resp.json().catch(() => ({})) : {};
      results.push({ step, status: resp.ok ? 'ok' : 'error', http: resp.status, response: body });
      logLine(`${resp.ok ? 'OK' : 'ERR'} ${step} → HTTP ${resp.status}`);
    } catch (e) {
      errors.push({ step, error: e.message });
      results.push({ step, status: 'error', error: e.message });
      logLine(`ERR ${step} → ${e.message}`);
    }
  }

  const duration_ms = Date.now() - startMs;
  logLine(`Cycle complete: ${cycle} | ${results.length} steps | ${errors.length} errors | ${duration_ms}ms`);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ cycle, niche, dry_run, steps_run: results, errors, duration_ms, log: logPath }, null, 2)
    }]
  };
}

// ─── Tool: acd_parallel_plan ──────────────────────────────────────────────────

const PLAN_TEMPLATES = {
  upwork: [
    { label: 'Niche Specialist', angle: 'Position as a specialist in {niche} with proven workflow automation results' },
    { label: 'ROI-First', angle: 'Lead with measurable ROI: hours saved, revenue unlocked, cost per outcome' },
    { label: 'Done-For-You', angle: 'Full-service implementation — client describes goal, you deliver working system' }
  ],
  dm: [
    { label: 'Curiosity Hook', angle: 'Open with an insight about their content/brand that shows you did research' },
    { label: 'Value-First', angle: 'Lead with a free resource or specific tip relevant to their niche' },
    { label: 'Direct Ask', angle: 'Short and direct: what you do, who you help, one clear CTA' }
  ],
  tweet: [
    { label: 'Hot Take', angle: 'Contrarian claim about {niche} that challenges conventional wisdom' },
    { label: 'How-To Thread', angle: 'Step-by-step breakdown of one specific tactic in {niche}' },
    { label: 'Story + Lesson', angle: 'Personal experience in {niche} with a concrete lesson extracted' }
  ],
  content: [
    { label: 'Educational', angle: 'Teach one concept in {niche} with examples and takeaways' },
    { label: 'Behind-the-Scenes', angle: 'Show your workflow/process in {niche} — transparency builds trust' },
    { label: 'Results Showcase', angle: 'Case study or before/after showing measurable outcome in {niche}' }
  ],
  offer: [
    { label: 'Done-For-You Package', angle: 'Fixed price, scoped deliverable, fast turnaround for {niche} clients' },
    { label: 'Retainer Model', angle: 'Monthly ongoing support and iteration for {niche} — predictable revenue' },
    { label: 'Course/Productized', angle: 'Self-serve system teaching {niche} skills — scalable, low touch' }
  ]
};

async function acdParallelPlan(params) {
  const { type, niche = 'ai_automation', context = '' } = params;
  const templates = PLAN_TEMPLATES[type];
  if (!templates) throw new Error(`Unknown type: ${type}. Valid: ${Object.keys(PLAN_TEMPLATES).join(', ')}`);

  // Read business goals for ICP and offers context
  let goalsContext = {};
  const goalsPath = GOALS_PATH;
  if (existsSync(goalsPath)) {
    try {
      const g = JSON.parse(readFileSync(goalsPath, 'utf8'));
      goalsContext = {
        icp: g.acquisition?.icp_profile || {},
        offers: g.acquisition?.offers || [],
        strategy_notes: g.strategy_notes || '',
        revenue_target: revenueTarget(g)
      };
    } catch (e) {}
  }

  // Score each variant based on ICP fit and niche relevance
  const variants = templates.map((t, i) => {
    const summary = t.angle.replace(/\{niche\}/g, niche);
    // Heuristic scoring: earlier templates slightly favored, boost for context match
    const contextBoost = context && summary.toLowerCase().includes(context.toLowerCase().split(' ')[0]) ? 0.5 : 0;
    const score = parseFloat((7.0 + (templates.length - i) * 0.3 + contextBoost).toFixed(1));
    return { label: t.label, summary, score };
  });

  // Sort by score descending to find winner
  const sorted = [...variants].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        type,
        niche,
        context: context || null,
        icp_summary: goalsContext.icp?.title || 'Not configured',
        variants,
        winner: winner.label,
        winner_reason: `Highest score (${winner.score}/10) — ${winner.summary}`,
        goals_context: goalsContext
      }, null, 2)
    }]
  };
}

// ─── Tool: acd_restart ───────────────────────────────────────────────────────

function acdRestart(params) {
  const { slug, targetPath, model, force = false } = params;
  const bad = invalidSlug(slug);
  if (bad) return bad;

  // Stop existing process (ok if not running)
  const stopResult = acdStop({ slug, force });
  const stopData = JSON.parse(stopResult.content[0].text);

  // Find PRD path
  const prdPath = prdFile(slug);
  if (!existsSync(prdPath)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'PRD_NOT_FOUND', prdPath, message: 'Cannot restart without a PRD file' })
      }]
    };
  }

  // Find feature list path
  const featureListPath = featureFile(slug);
  if (!existsSync(featureListPath)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'FEATURES_NOT_FOUND', checked: [featureListPath] })
      }]
    };
  }

  // Re-start
  const startResult = acdStart({ slug, promptPath: prdPath, featureListPath, targetPath, model });
  const startData = JSON.parse(startResult.content[0].text);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        restarted: !startData.error,
        previouslyStopped: stopData.stopped !== false,
        pid: startData.pid,
        slug,
        logFile: startData.logFile,
        error: startData.error || null
      })
    }]
  };
}

// ─── Tool: acd_prune_pids ────────────────────────────────────────────────────

function acdPrunePids() {
  if (!existsSync(PIDS_DIR)) {
    return { content: [{ type: 'text', text: JSON.stringify({ pruned: 0, message: 'pids directory not found' }) }] };
  }

  const removed = [];
  const kept = [];
  let pruned = 0;

  try {
    const files = readdirSync(PIDS_DIR).filter(f => f.endsWith('.pid'));
    for (const file of files) {
      const slug = basename(file, '.pid');
      const pidFile = join(PIDS_DIR, file);
      try {
        const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
        if (isNaN(pid)) {
          unlinkSync(pidFile);
          removed.push({ slug, reason: 'invalid pid' });
          pruned++;
          continue;
        }
        try {
          process.kill(pid, 0);
          kept.push({ slug, pid });
        } catch (_) {
          unlinkSync(pidFile);
          removed.push({ slug, pid, reason: 'process dead' });
          pruned++;
        }
      } catch (e) {
        removed.push({ slug, reason: `read error: ${e.message}` });
      }
    }
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to read pids dir: ${e.message}` }) }] };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ pruned, kept: kept.length, keptItems: kept, removed })
    }]
  };
}

// ─── Tool: acd_get_log_errors ─────────────────────────────────────────────────

function acdGetLogErrors(params) {
  const { slug, lines = 20 } = params;
  const bad = invalidSlug(slug);
  if (bad) return bad;
  const logFile = join(LOGS_DIR, `${slug}.log`);

  if (!existsSync(logFile)) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Log not found: ${logFile}` }) }] };
  }

  try {
    const stat = statSync(logFile);
    const chunkSize = Math.min(stat.size, 131072); // read last 128KB to find errors
    let chunk = '';
    if (chunkSize > 0) {
      const fd = openSync(logFile, 'r');
      const buf = Buffer.alloc(chunkSize);
      readSync(fd, buf, 0, chunkSize, stat.size - chunkSize);
      closeSync(fd);
      chunk = buf.toString('utf8');
    }
    const errorLines = chunk
      .split('\n')
      .filter(l => /error|ERROR|Error|FAIL|fail|exception|Exception|Traceback|TypeError|ReferenceError/.test(l));
    const tail = errorLines.slice(-lines);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ slug, totalErrorLines: errorLines.length, lines: tail })
      }]
    };
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] };
  }
}

// ─── Tool: acd_target_status ─────────────────────────────────────────────────
// TERMINOLOGY: target = a whole project repo | feature = unit of work within a target

async function acdTargetStatus(args) {
  const { group = 'all', refresh = false } = args || {};
  const REPORT_FILE = process.env.ACD_STATUS_REPORT || join(METRICS_DIR, 'project-status-report.json');
  const STATUS_SCRIPT = join(ENGINE_DIR, 'project-status.js');

  try {
    let needsScan = refresh;
    if (!needsScan) {
      if (!existsSync(REPORT_FILE)) {
        needsScan = true;
      } else {
        const ageMs = Date.now() - statSync(REPORT_FILE).mtimeMs;
        if (ageMs > 60 * 60 * 1000) needsScan = true;
      }
    }
    if (needsScan && existsSync(STATUS_SCRIPT)) {
      execSync(`node "${STATUS_SCRIPT}"`, { timeout: 30000, stdio: 'ignore' });
    }
    if (!existsSync(REPORT_FILE)) {
      return { content: [{ type: 'text', text: `No target status cached. Run: node ${STATUS_SCRIPT}` }] };
    }

    const report = JSON.parse(readFileSync(REPORT_FILE, 'utf-8'));
    const { summary, projects } = report;

    // Apply group filter — support new terminology aliases
    let filtered = projects;
    if (group === 'incomplete' || group === 'building') {
      filtered = projects.filter(p => p.features && !p.complete);
    } else if (group === 'done') {
      filtered = projects.filter(p => p.complete === true);
    } else if (group === 'untracked') {
      filtered = projects.filter(p => p.complete === null);
    } else if (group !== 'all') {
      filtered = projects.filter(p => p.group === group);
    }

    const lines = [];
    lines.push(`🎯 Target Status — ${new Date(summary.generated_at).toLocaleString()}`);
    lines.push(`TARGETS: ${summary.total} total | ${summary.active} active(7d) | ${summary.recent} recent(30d) | ${summary.stale} stale | ${summary.no_git} no-git`);
    lines.push(`ACD:     ${summary.features_complete} targets done | ${summary.features_incomplete} targets building | ${summary.with_features} targets tracked`);
    lines.push(`DEPLOY:  ${summary.vercel_deployed} on Vercel | ${summary.live_ports} live local ports`);
    lines.push('');
    lines.push('STATUS   TARGET                             FEATURES         TYPE       LAST COMMIT');
    lines.push('─'.repeat(90));

    let currentGroup = null;
    for (const p of filtered) {
      if (p.group !== currentGroup) {
        currentGroup = p.group;
        const label = { active: 'ACTIVE — last 7 days', recent: 'RECENT — last 30 days', stale: 'STALE — >30 days', 'no-git': 'NO GIT — untracked folders' }[p.group] || p.group;
        lines.push(`\n  ── ${label} ──`);
      }
      const feat = p.features ? `${p.features.passing}/${p.features.total}(${p.features.pct}%)` : 'not tracked';
      const age = p.git ? p.git.age : 'no-git';
      const v = p.vercel ? '▲' : ' ';
      const s = p.complete === true ? '✅DONE   ' : p.complete === false ? '🔄BUILDING' : '  UNTRACK';
      lines.push(`${s} ${v}${p.name.padEnd(34)} ${feat.padEnd(17)} ${p.type.padEnd(10)} ${age}`);
    }

    lines.push('');
    lines.push(`Showing ${filtered.length}/${projects.length} targets. Filter: group=active|recent|stale|incomplete|building|done|untracked|no-git|all`);
    lines.push('NOTE: target=whole project repo | feature=unit of work within a target');

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
  }
}

// ─── Tool: acd_assess_all ────────────────────────────────────────────────────

function acdAssessAll(args) {
  const { group = 'all', format = 'summary' } = args || {};

  // 1. Enumerate all PRD slugs from data/prds/
  const slugs = [];
  try {
    for (const f of readdirSync(PRDS_DIR)) {
      if (f.endsWith('.md')) slugs.push(f.replace(/\.md$/, ''));
    }
  } catch (e) {
    return { content: [{ type: 'text', text: `Error reading PRD dir: ${e.message}` }] };
  }

  const results = [];

  for (const slug of slugs.sort()) {
    // Canonical feature file lives in data/features/<slug>.json
    const featurePath = featureFile(slug);
    const hasFeatures = existsSync(featurePath);

    let total = 0, passing = 0, pct = 0;
    if (hasFeatures) {
      try {
        const data = JSON.parse(readFileSync(featurePath, 'utf-8'));
        const features = Array.isArray(data.features) ? data.features : [];
        total = features.length;
        passing = features.filter(f => f.passes === true).length;
        pct = total > 0 ? Math.round((passing / total) * 100) : 0;
      } catch (_) {}
    }

    // Log file
    const logFile = join(LOGS_DIR, `${slug}.log`);
    const hasLog = existsSync(logFile);
    let lastActivity = null;
    if (hasLog) {
      try {
        const stat = statSync(logFile);
        lastActivity = stat.mtime.toISOString().slice(0, 16).replace('T', ' ');
      } catch (_) {}
    }

    // Determine status
    let status;
    if (!hasFeatures) {
      status = 'NO_FEATURES';
    } else if (pct === 100) {
      status = 'COMPLETE';
    } else if (passing > 0) {
      status = 'IN_PROGRESS';
    } else {
      status = 'NOT_STARTED';
    }

    results.push({ slug, status, passing, total, pct, hasLog, lastActivity });
  }

  // Filter
  const filtered = group === 'all' ? results : results.filter(r => r.status.toLowerCase() === group.toLowerCase());

  // Counts
  const counts = {
    COMPLETE: results.filter(r => r.status === 'COMPLETE').length,
    IN_PROGRESS: results.filter(r => r.status === 'IN_PROGRESS').length,
    NOT_STARTED: results.filter(r => r.status === 'NOT_STARTED').length,
    NO_FEATURES: results.filter(r => r.status === 'NO_FEATURES').length,
    total: results.length
  };

  if (format === 'json') {
    return { content: [{ type: 'text', text: JSON.stringify({ counts, projects: filtered }, null, 2) }] };
  }

  const lines = [];
  lines.push(`📊 ACD Project Assessment — ${new Date().toLocaleString()}`);
  lines.push(`Total: ${counts.total} PRDs | ✅ ${counts.COMPLETE} complete | 🔄 ${counts.IN_PROGRESS} in progress | ⏳ ${counts.NOT_STARTED} not started | ❌ ${counts.NO_FEATURES} no feature file`);
  lines.push('');

  if (format === 'table') {
    lines.push('STATUS        SLUG                                    FEATURES   LAST ACTIVITY');
    lines.push('─'.repeat(90));
    for (const r of filtered) {
      const icon = { COMPLETE: '✅', IN_PROGRESS: '🔄', NOT_STARTED: '⏳', NO_FEATURES: '❌' }[r.status] || '  ';
      const feat = r.hasFeatures ? `${r.passing}/${r.total}(${r.pct}%)` : 'none';
      lines.push(`${icon} ${r.status.padEnd(13)} ${r.slug.padEnd(40)} ${feat.padEnd(12)} ${r.lastActivity || '—'}`);
    }
  } else {
    // Summary grouped by status
    const groups = ['COMPLETE', 'IN_PROGRESS', 'NOT_STARTED', 'NO_FEATURES'];
    for (const g of groups) {
      const items = filtered.filter(r => r.status === g);
      if (items.length === 0) continue;
      const icons = { COMPLETE: '✅', IN_PROGRESS: '🔄', NOT_STARTED: '⏳', NO_FEATURES: '❌' };
      lines.push(`${icons[g]} ${g} (${items.length})`);
      for (const r of items) {
        const feat = r.total > 0 ? ` ${r.passing}/${r.total} (${r.pct}%)` : '';
        const act = r.lastActivity ? ` — ${r.lastActivity}` : '';
        lines.push(`   ${r.slug}${feat}${act}`);
      }
      lines.push('');
    }
  }

  lines.push(`Filter: group=complete|in_progress|not_started|no_features|all  Format: format=summary|table|json`);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ─── Tool: acd_run_tests ─────────────────────────────────────────────────────

async function acdRunTests(args) {
  const { slug, targetPath, timeout = 60000 } = args || {};

  // Build list of (slug, path) pairs to test
  let targets = [];

  if (targetPath) {
    targets = [{ slug: slug || basename(targetPath), path: targetPath }];
  } else if (slug) {
    // Look up path from feature file or project-status-report
    const reportFile = process.env.ACD_STATUS_REPORT || join(METRICS_DIR, 'project-status-report.json');
    let found = null;
    if (existsSync(reportFile)) {
      try {
        const report = JSON.parse(readFileSync(reportFile, 'utf-8'));
        const p = (report.projects || []).find(p => p.name === slug || p.slug === slug);
        if (p && p.path) found = p.path;
      } catch (_) {}
    }
    // fallback: try common paths
    if (!found) {
      const candidates = [
        join(SOFTWARE_ROOT, slug),
        join(SOFTWARE_ROOT, slug.replace(/^ytsb-/, 'YoutubeShadowbanApp')),
      ];
      for (const c of candidates) {
        if (existsSync(c)) { found = c; break; }
      }
    }
    if (!found) {
      return { content: [{ type: 'text', text: `Could not resolve path for slug: ${slug}. Pass targetPath explicitly.` }] };
    }
    targets = [{ slug, path: found }];
  } else {
    // All projects — scan SOFTWARE_ROOT for dirs with package.json that have a test script
    try {
      const dirs = readdirSync(SOFTWARE_ROOT);
      for (const d of dirs) {
        const pkgPath = join(SOFTWARE_ROOT, d, 'package.json');
        if (!existsSync(pkgPath)) continue;
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          if (pkg.scripts && pkg.scripts.test && !pkg.scripts.test.includes('no test')) {
            targets.push({ slug: d, path: join(SOFTWARE_ROOT, d) });
          }
        } catch (_) {}
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `Error scanning projects: ${e.message}` }] };
    }
  }

  if (targets.length === 0) {
    return { content: [{ type: 'text', text: 'No projects with test scripts found.' }] };
  }

  const results = [];
  const lines = [];
  lines.push(`🧪 Running tests for ${targets.length} project(s)...`);
  lines.push('');

  for (const t of targets) {
    const pkgPath = join(t.path, 'package.json');
    if (!existsSync(pkgPath)) {
      results.push({ slug: t.slug, status: 'SKIP', reason: 'no package.json' });
      lines.push(`⏭ SKIP  ${t.slug} — no package.json`);
      continue;
    }

    let testCmd = 'npm test';
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (!pkg.scripts || !pkg.scripts.test || pkg.scripts.test.includes('no test')) {
        results.push({ slug: t.slug, status: 'SKIP', reason: 'no test script' });
        lines.push(`⏭ SKIP  ${t.slug} — no test script`);
        continue;
      }
      // Prefer vitest or jest directly if available
      if (pkg.scripts.test.includes('vitest')) testCmd = 'npx vitest run';
      else if (pkg.scripts.test.includes('jest')) testCmd = 'npx jest --passWithNoTests';
    } catch (_) {}

    try {
      execSync(testCmd, { cwd: t.path, timeout, stdio: 'pipe' });
      results.push({ slug: t.slug, status: 'PASS' });
      lines.push(`✅ PASS  ${t.slug}`);
    } catch (e) {
      const stderr = e.stderr ? e.stderr.toString().slice(0, 300) : '';
      const stdout = e.stdout ? e.stdout.toString().slice(0, 300) : '';
      const detail = (stderr || stdout).trim().split('\n').slice(-5).join(' | ');
      results.push({ slug: t.slug, status: 'FAIL', detail });
      lines.push(`❌ FAIL  ${t.slug}`);
      if (detail) lines.push(`        ${detail}`);
    }
  }

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const skip = results.filter(r => r.status === 'SKIP').length;
  lines.push('');
  lines.push(`Results: ✅ ${pass} passed | ❌ ${fail} failed | ⏭ ${skip} skipped`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ─── Tool dispatcher ─────────────────────────────────────────────────────────

async function callTool(name, args) {
  switch (name) {
    case 'acd_list_projects':     return acdListProjects(args);
    case 'acd_start':             return acdStart(args);
    case 'acd_status':            return acdStatus(args);
    case 'acd_logs':              return acdLogs(args);
    case 'acd_stop':              return acdStop(args);
    case 'acd_list_prds':         return acdListPrds(args);
    case 'acd_write_prd':         return acdWritePrd(args);
    case 'acd_generate_features': return await acdGenerateFeatures(args);
    case 'acd_dispatch':          return await acdDispatch(args);
    case 'acd_list_running':      return acdListRunning();
    case 'acd_read_memory':       return await acdReadMemory(args);
    case 'acd_write_memory':      return await acdWriteMemory(args);
    case 'acd_heartbeat_status':  return await acdHeartbeatStatus();
    case 'acd_schedule':          return acdSchedule(args);
    case 'acd_list_scheduled':    return acdListScheduled();
    case 'acd_get_goals':         return acdGetGoals();
    case 'acd_update_goals':      return acdUpdateGoals(args);
    case 'acd_target_status':     return await acdTargetStatus(args);
    case 'acd_project_status':    return await acdTargetStatus(args); // legacy alias
    case 'acd_orchestrate':       return await acdOrchestrate(args);
    case 'acd_run_cycle':         return await acdRunCycle(args);
    case 'acd_parallel_plan':     return await acdParallelPlan(args);
    case 'acd_restart':           return acdRestart(args);
    case 'acd_prune_pids':        return acdPrunePids();
    case 'acd_get_log_errors':    return acdGetLogErrors(args);
    case 'acd_assess_all':        return acdAssessAll(args);
    case 'acd_run_tests':         return await acdRunTests(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── JSON-RPC request handler ─────────────────────────────────────────────────

async function handleRequest(line) {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch (e) {
    console.error('Invalid JSON on stdin:', e.message);
    return;
  }

  const { id, method, params } = request;

  if (method === 'initialize') {
    sendResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'acd-harness', version: '1.0.0' }
    });
    return;
  }

  if (method === 'notifications/initialized') {
    // No response needed for notifications
    return;
  }

  if (method === 'tools/list') {
    sendResponse(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params && params.name;
    const toolArgs = (params && params.arguments) || {};
    try {
      const result = await callTool(toolName, toolArgs);
      sendResponse(id, result);
    } catch (e) {
      console.error('Tool error:', e.message);
      sendError(id, -32603, e.message);
    }
    return;
  }

  sendError(id, -32601, `Method not found: ${method}`);
}

// ─── Activity Log ring buffer (ACD-AUTO-003) ──────────────────────────────────

const ACTIVITY_RING = [];
const ACTIVITY_RING_MAX = 200;
const sseClients = new Set();

function activityPush(event) {
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    agent: event.agent || 'acd',
    action: event.action || '',
    status: event.status || 'info',
    detail: event.detail || ''
  };
  ACTIVITY_RING.push(entry);
  if (ACTIVITY_RING.length > ACTIVITY_RING_MAX) ACTIVITY_RING.shift();
  for (const res of sseClients) {
    try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch (e) { sseClients.delete(res); }
  }
  return entry;
}

// ─── HTTP Activity Server (ACD-AUTO-003 / ACD-AUTO-004) ──────────────────────
// Disabled by default: only starts when ACTIVITY_PORT is set (PORTS.activity).
// Binding unconditionally would crash the MCP stdio transport with EADDRINUSE
// whenever a second instance of this server spawns.

const ACTIVITY_PORT = PORTS.activity;

function buildActivityServer() {
  return createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/api/activity-log' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        const entry = activityPush(event);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(entry));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.url === '/api/activity-log' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ACTIVITY_RING));
    return;
  }

  if (req.url === '/api/activity-stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', buffered: ACTIVITY_RING.length })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (req.url === '/api/rate-limit-status' && req.method === 'GET') {
    const snapshot = rateCoord.getSnapshot();
    const check = rateCoord.checkGlobalState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ globalPause: snapshot.globalPause, processes: snapshot.processes, limited: check.limited, waitMs: check.waitMs, reason: check.reason }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', routes: ['POST /api/activity-log', 'GET /api/activity-log', 'GET /api/activity-stream', 'GET /api/rate-limit-status'] }));
  });
}

// Only start the activity HTTP server when explicitly enabled via ACTIVITY_PORT.
// A failed bind (e.g. EADDRINUSE from a second spawn) must NOT crash the MCP
// stdio transport, so listen is fully guarded.
if (ACTIVITY_PORT) {
  try {
    const activityServer = buildActivityServer();
    activityServer.on('error', (err) => {
      process.stderr.write(`[acd-mcp] activity server error: ${err.code || err.message} (port ${ACTIVITY_PORT}) — continuing without it\n`);
    });
    activityServer.listen(ACTIVITY_PORT, '127.0.0.1', () => {
      process.stderr.write(`[acd-mcp] activity server listening on :${ACTIVITY_PORT}\n`);
    });
  } catch (err) {
    process.stderr.write(`[acd-mcp] failed to start activity server: ${err.message} — continuing without it\n`);
  }
}

// ─── Start stdio listener ─────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', handleRequest);
rl.on('close', () => process.exit(0));
