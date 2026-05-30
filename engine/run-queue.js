#!/usr/bin/env node

/**
 * Multi-Repo Queue Runner
 * ========================
 * 
 * Chains multiple repos together, working through them by priority.
 * Supports PRD-to-feature-list generation and priority-based ordering.
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as metricsDb from './metrics-db.js';
import { QUEUE_FILE as DEFAULT_QUEUE_FILE, METRICS_DIR, LOGS_DIR, featureFile } from './paths.js';
import { acquireSlot, releaseSlot } from './concurrency.js';
import { parseUsage } from './usage-parser.js';
import { withLock } from './state-lock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Global concurrency cap on the TOTAL number of concurrent `claude` processes
// across ALL workers/queues. Each worker acquires a slot before spawning the
// harness (which spawns claude) and releases it after.
const MAX_GLOBAL_CONCURRENCY = parseInt(process.env.ACD_MAX_CONCURRENCY || '4', 10);

// Lock-guarded budget state shared across all concurrent workers.
const BUDGET_STATE_FILE = path.join(METRICS_DIR, 'budget-state.json');
const CLAUDE_USAGE_FILE = path.join(METRICS_DIR, 'claude-usage.json');

// ============================================================
// STRICT AUTH ENFORCEMENT: Claude OAuth only — never API key
// ============================================================
if (process.env.ANTHROPIC_API_KEY) {
  console.error('\n╔══════════════════════════════════════════════════════════╗');
  console.error('║  FATAL: ANTHROPIC_API_KEY is set in environment          ║');
  console.error('║  ACD must NEVER use Claude API key auth.                 ║');
  console.error('║  This would incur direct API costs.                      ║');
  console.error('║                                                          ║');
  console.error('║  Fix: unset ANTHROPIC_API_KEY                            ║');
  console.error('║  Auth: CLAUDE_CODE_OAUTH_TOKEN (Claude subscription)     ║');
  console.error('╚══════════════════════════════════════════════════════════╝\n');
  process.exit(2);
}

// Configuration
let QUEUE_FILE = DEFAULT_QUEUE_FILE;
let GENERATE_FEATURES = false;
let DRY_RUN = false;
let HOURS_PER_REPO = null;
let TOTAL_HOURS = null;
let FORCE_REPO = null;
let WORKER_SLOT = null;   // 0-based index of this worker
let TOTAL_SLOTS = 1;      // total parallel workers
let LOOP_MODE = false;
let AUTO_COMMIT = true;
let INTER_REPO_DELAY_SEC = 30;
let ENABLE_METRICS_DB = true;

const STATUS_FILE = path.join(METRICS_DIR, 'queue-status.json');
const LOG_FILE = path.join(LOGS_DIR, 'queue-output.log');
const HEARTBEAT_FILE = path.join(METRICS_DIR, 'watchdog-heartbeat.json');

// Ensure runtime dirs exist (data/metrics, data/logs).
try { fs.mkdirSync(METRICS_DIR, { recursive: true }); } catch { /* exists */ }
try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch { /* exists */ }

// Metrics tracking state
let metricsEnabled = false;
let sessionCounter = {};

// Watchdog heartbeat state
let heartbeatInterval = null;

// Watchdog heartbeat — written every 2 min so watchdog.js can detect stalls
function writeHeartbeat(currentRepoId, passingCount) {
  try {
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({
      pid: process.pid,
      ts: new Date().toISOString(),
      currentRepo: currentRepoId || null,
      passingCount: passingCount || 0,
    }));
  } catch (e) {
    // non-fatal
  }
}

// Logging
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    start: '🚀',
    end: '🏁',
    pause: '⏸️',
    next: '➡️',
    skip: '⏭️',
  }[level] || '•';

  const line = `${timestamp} ${prefix} ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    // ignore
  }
}

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    log(`Queue file not found: ${QUEUE_FILE}`, 'error');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
}

function saveStatus(status) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

function loadStatus() {
  if (!fs.existsSync(STATUS_FILE)) {
    return {
      currentRepo: null,
      completedRepos: [],
      startedAt: null,
      lastUpdated: null,
      totalSessions: 0,
      lastCompletedRepo: null,
    };
  }
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
  } catch (e) {
    return {
      currentRepo: null,
      completedRepos: [],
      startedAt: null,
      lastUpdated: null,
      totalSessions: 0,
      lastCompletedRepo: null,
    };
  }
}

function gitCommit(repoPath, message) {
  if (!AUTO_COMMIT) return false;
  try {
    execSync('git add -A', { cwd: repoPath, stdio: 'ignore' });
    execSync(`git commit -m "${message}" --allow-empty`, { cwd: repoPath, stdio: 'ignore' });
    log(`Git commit: ${message}`, 'success');
    return true;
  } catch (e) {
    log(`Git commit failed: ${e.message}`, 'warning');
    return false;
  }
}

// Resolve the canonical feature-list path for a repo.
// Prefers data/features/<slug>.json (the canonical location in this package);
// falls back to the path stored in the queue (which may point at a legacy
// location) if no canonical file exists yet.
function resolveFeatureList(repo) {
  const key = repo.slug || repo.id;
  if (key) {
    const canonical = featureFile(key);
    if (fs.existsSync(canonical)) return canonical;
    // If the stored path is missing/legacy, default new generation to canonical.
    if (!repo.featureList || !fs.existsSync(repo.featureList)) return canonical;
  }
  return repo.featureList;
}

function getRepoProgress(repo) {
  const fl = resolveFeatureList(repo);
  if (!fl || !fs.existsSync(fl)) {
    return { total: 0, passing: 0, percent: 0 };
  }
  try {
    const data = JSON.parse(fs.readFileSync(fl, 'utf-8'));
    const features = data.features || [];
    const total = features.length;
    const passing = features.filter(f => f.passes).length;
    return {
      total,
      passing,
      percent: total > 0 ? ((passing / total) * 100).toFixed(1) : 0,
    };
  } catch (e) {
    return { total: 0, passing: 0, percent: 0 };
  }
}

function isRepoComplete(repo) {
  const progress = getRepoProgress(repo);
  return progress.total > 0 && progress.passing === progress.total;
}

async function generateFeaturesForRepo(repo) {
  if (!repo.prd || !fs.existsSync(repo.prd)) {
    log(`No PRD found for ${repo.name}, skipping feature generation`, 'warning');
    return false;
  }

  const outFeatureList = resolveFeatureList(repo);

  // Check if features already exist
  if (fs.existsSync(outFeatureList)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outFeatureList, 'utf-8'));
      if (existing.features && existing.features.length > 0) {
        log(`Feature list exists for ${repo.name} (${existing.features.length} features)`, 'info');
        return true;
      }
    } catch (e) {
      // Continue to generate
    }
  }

  log(`Generating feature list for ${repo.name}...`, 'info');

  return new Promise((resolve) => {
    const proc = spawn('node', [
      path.join(__dirname, 'generate-features.js'),
      `--prd=${repo.prd}`,
      `--output=${outFeatureList}`,
      `--name=${repo.name}`,
    ], {
      cwd: __dirname,
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', (err) => {
      log(`Feature generation failed: ${err.message}`, 'error');
      resolve(false);
    });
  });
}

// Get model based on complexity level from queue config (target-independent)
function getModelForComplexity(queue, complexity, taskType = null) {
  const config = queue.modelConfig || {};
  const levels = config.complexityLevels || {
    critical: { models: ['claude-opus-4-6'], fallback: 'claude-sonnet-4-5-20250929' },
    high: { models: ['claude-opus-4-6'], fallback: 'claude-sonnet-4-5-20250929' },
    medium: { models: ['claude-sonnet-4-5-20250929'], fallback: 'claude-haiku-4-5-20251001' },
    low: { models: ['claude-sonnet-4-5-20250929'], fallback: 'claude-haiku-4-5-20251001' },
    trivial: { models: ['claude-haiku-4-5-20251001'], fallback: 'claude-haiku-4-5-20251001' }
  };
  
  // If taskType provided, map it to complexity level
  let effectiveComplexity = complexity;
  if (taskType && config.taskTypeMapping) {
    effectiveComplexity = config.taskTypeMapping[taskType] || complexity;
  }
  
  // Use default if complexity not specified
  if (!effectiveComplexity) {
    effectiveComplexity = config.defaultComplexity || 'medium';
  }
  
  const level = levels[effectiveComplexity] || levels.medium;
  // Return primary model (first in list)
  return { 
    model: level.models[0] || 'haiku',
    complexity: effectiveComplexity,
    maxRetries: level.maxRetries || 3,
    fallback: level.fallback || 'haiku'
  };
}

// Detect task type from feature or focus description
function detectTaskType(feature, focus) {
  const text = `${feature || ''} ${focus || ''}`.toLowerCase();
  
  if (text.includes('architect') || text.includes('system design')) return 'architecture';
  if (text.includes('security') || text.includes('auth')) return 'security';
  if (text.includes('api') || text.includes('integration')) return 'api_integration';
  if (text.includes('database') || text.includes('migration') || text.includes('schema')) return 'database';
  if (text.includes('new feature') || text.includes('implement')) return 'new_feature';
  if (text.includes('ui') || text.includes('component') || text.includes('frontend')) return 'ui_component';
  if (text.includes('refactor') || text.includes('cleanup')) return 'refactor';
  if (text.includes('test') || text.includes('spec')) return 'test';
  if (text.includes('bug') || text.includes('fix')) return 'bug_fix';
  if (text.includes('doc') || text.includes('readme')) return 'documentation';
  
  return null; // Use default
}

async function runRepoSession(repo, options = {}) {
  const { maxSessions, hours, untilComplete, queue } = options;

  const args = [
    path.join(__dirname, 'run-harness-v2.js'),
    `--path=${repo.path}`,
    `--project=${repo.id}`,
  ];

  // Select model based on complexity (target-independent)
  // Detect task type from focus or use repo complexity as fallback
  const taskType = detectTaskType(null, repo.focus);
  const modelConfig = getModelForComplexity(queue || {}, repo.complexity, taskType);
  args.push(`--model=${modelConfig.model}`);
  args.push(`--max-retries=${modelConfig.maxRetries}`);
  args.push(`--fallback-model=${modelConfig.fallback}`);
  log(`Using model: ${modelConfig.model} (complexity: ${modelConfig.complexity}, task: ${taskType || 'default'})`, 'info');

  // Add prompt if specified
  if (repo.prompt) {
    const promptPath = repo.prompt.startsWith('/')
      ? repo.prompt
      : path.join(__dirname, repo.prompt);
    if (fs.existsSync(promptPath)) {
      args.push(`--prompt=${promptPath}`);
    }
  }

  // Pass custom feature list path if it differs from the default.
  // Use the canonical feature-list location (data/features/<slug>.json).
  const featureListPath = resolveFeatureList(repo);
  const defaultFeatureList = path.join(repo.path, 'feature_list.json');
  if (featureListPath && path.resolve(featureListPath) !== path.resolve(defaultFeatureList)) {
    args.push(`--feature-list=${featureListPath}`);
    // Skip initializer phase — feature list already exists, go straight to coding
    if (fs.existsSync(featureListPath)) {
      args.push('--force-coding');
    }
  }

  // Always enable adaptive delay for sawtooth pattern
  args.push('--adaptive-delay');

  // Duration/completion options
  if (untilComplete || repo.untilComplete) {
    args.push('--until-complete');
  } else if (hours) {
    args.push(`--hours=${hours}`);
  } else if (repo.maxSessions || maxSessions) {
    args.push(`--max=${repo.maxSessions || maxSessions}`);
  }

  log(`Starting harness for ${repo.name}`, 'start');
  log(`Command: node ${args.join(' ')}`, 'info');

  if (DRY_RUN) {
    log(`[DRY RUN] Would execute harness for ${repo.name}`, 'info');
    return { success: true, repo: repo.id };
  }

  // ── Global concurrency cap ──────────────────────────────────────────────
  // Acquire a global slot BEFORE spawning the harness (which spawns claude),
  // so the TOTAL number of concurrent claude processes across all workers and
  // queues never exceeds MAX_GLOBAL_CONCURRENCY. Released in the finally below.
  const slot = await acquireSlot(MAX_GLOBAL_CONCURRENCY, {
    label: repo.id,
    log: (m) => log(m, 'info'),
  });

  try {
    return await new Promise((resolve) => {
      const spawnEnv = { ...process.env };
      delete spawnEnv.CLAUDECODE; // allow nested claude sessions spawned by harness
      // Pipe stdout/stderr so we can tee to our console/log AND capture the
      // claude --output-format stream-json lines for real token/cost telemetry.
      const proc = spawn('node', args, {
        cwd: __dirname,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: spawnEnv,
      });

      let captured = '';
      const MAX_CAPTURE = 8 * 1024 * 1024; // cap buffer at 8 MB to bound memory
      const onChunk = (stream) => (data) => {
        const text = data.toString();
        stream.write(text); // tee to our own stdout/stderr
        if (captured.length < MAX_CAPTURE) captured += text;
      };
      proc.stdout.on('data', onChunk(process.stdout));
      proc.stderr.on('data', onChunk(process.stderr));

      proc.on('close', (code) => {
        const progress = getRepoProgress(repo);
        const usage = parseUsage(captured, modelConfig.model);
        log(`Harness finished for ${repo.name} (exit: ${code}, progress: ${progress.passing}/${progress.total}, tokens: ${usage.totalTokens}, cost: $${usage.costUsd.toFixed(4)}${usage.costEstimated ? ' est' : ''})`, code === 0 ? 'success' : 'warning');
        resolve({
          success: code === 0,
          repo: repo.id,
          progress,
          usage,
          complete: isRepoComplete(repo),
        });
      });

      proc.on('error', (err) => {
        log(`Harness failed for ${repo.name}: ${err.message}`, 'error');
        resolve({ success: false, repo: repo.id, error: err.message });
      });
    });
  } finally {
    await releaseSlot(slot, { log: (m) => log(m, 'info') });
  }
}

async function initMetricsDb() {
  if (!ENABLE_METRICS_DB) {
    log('Metrics DB disabled', 'info');
    return false;
  }
  try {
    const result = await metricsDb.testConnection();
    log(`Metrics DB connected: ${result.time}`, 'success');
    metricsEnabled = true;
    return true;
  } catch (error) {
    log(`Metrics DB unavailable: ${error.message}`, 'warning');
    metricsEnabled = false;
    return false;
  }
}

async function trackSessionStart(repoId, repoName, repoPath) {
  if (!metricsEnabled) return null;
  try {
    await metricsDb.ensureTarget(repoId, repoName, repoPath);
    sessionCounter[repoId] = (sessionCounter[repoId] || 0) + 1;
    const session = await metricsDb.startSession(repoId, sessionCounter[repoId]);
    return session.id;
  } catch (error) {
    log(`Failed to track session start: ${error.message}`, 'warning');
    return null;
  }
}

// Lock-guarded increment of the shared daily budget state. Concurrent workers
// can finish sessions simultaneously; the file lock makes the read-modify-write
// atomic so token/cost increments are never lost.
async function recordBudgetUsage(usage) {
  if (!usage || (!usage.totalTokens && !usage.costUsd)) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    await withLock(BUDGET_STATE_FILE, (cur) => {
      const fresh = (cur && cur.date === today)
        ? cur
        : { date: today, tokensUsed: 0, costUsed: 0, checkpointsHit: [], pausedUntil: null };
      return {
        ...fresh,
        tokensUsed: (fresh.tokensUsed || 0) + (usage.totalTokens || 0),
        costUsed: (fresh.costUsed || 0) + (usage.costUsd || 0),
      };
    }, { fallback: { date: today, tokensUsed: 0, costUsed: 0, checkpointsHit: [], pausedUntil: null } });

    // Mirror cumulative usage into claude-usage.json under its own lock so
    // peers reading it don't lose concurrent increments either.
    await withLock(CLAUDE_USAGE_FILE, (cur) => {
      const base = (cur && typeof cur === 'object') ? cur : {};
      return {
        ...base,
        lastUpdated: new Date().toISOString(),
        cumulativeInputTokens: (base.cumulativeInputTokens || 0) + (usage.inputTokens || 0),
        cumulativeOutputTokens: (base.cumulativeOutputTokens || 0) + (usage.outputTokens || 0),
        cumulativeCostUsd: (base.cumulativeCostUsd || 0) + (usage.costUsd || 0),
      };
    }, { fallback: {} });
  } catch (e) {
    log(`Budget usage record failed (non-fatal): ${e.message}`, 'warning');
  }
}

async function trackSessionEnd(sessionId, repoId, result, progressBefore, progressAfter) {
  const usage = result.usage || {};
  // Always update the shared budget state with real usage, even if the
  // metrics DB is unavailable.
  await recordBudgetUsage(usage);

  if (!metricsEnabled || !sessionId) return;
  try {
    await metricsDb.endSession(sessionId, {
      status: result.success ? 'completed' : 'failed',
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      cacheReadTokens: usage.cacheReadTokens || 0,
      cacheWriteTokens: usage.cacheWriteTokens || 0,
      costUsd: usage.costUsd || 0,
      turnCount: usage.turnCount || 0,
      featuresBefore: progressBefore.passing,
      featuresAfter: progressAfter.passing,
      featuresCompleted: progressAfter.passing - progressBefore.passing,
      commitsMade: 0,
      errorType: result.error ? 'unknown' : null,
      errorMessage: result.error || null,
    });
    await metricsDb.updateDailyStats(repoId);
  } catch (error) {
    log(`Failed to track session end: ${error.message}`, 'warning');
  }
}

async function runQueue() {
  const queue = loadQueue();
  const status = loadStatus();

  log('Multi-Repo Queue Runner Starting', 'start');
  log(`Queue file: ${QUEUE_FILE}`, 'info');
  
  // Initialize metrics database
  await initMetricsDb();

  // Start watchdog heartbeat (every 2 min)
  writeHeartbeat(null, 0);
  heartbeatInterval = setInterval(() => {
    try {
      const s = loadStatus();
      const currentRepo = queue.repos.find(r => r.id === s.currentRepo);
      const progress = currentRepo ? getRepoProgress(currentRepo) : { passing: 0 };
      writeHeartbeat(s.currentRepo, progress.passing);
    } catch (e) {
      // non-fatal
    }
  }, 2 * 60 * 1000);

  // Sort repos by priority
  const allRepos = queue.repos
    .filter(r => r.enabled !== false)
    .filter(r => !FORCE_REPO || r.id === FORCE_REPO)
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));

  // Parallel slot filtering: each worker takes every Nth incomplete repo
  let repos = allRepos;
  if (WORKER_SLOT !== null && TOTAL_SLOTS > 1) {
    // Assign slots only to incomplete repos so workers stay busy
    const incomplete = allRepos.filter(r => !isRepoComplete(r));
    const slotted = new Set(incomplete.filter((_, i) => i % TOTAL_SLOTS === WORKER_SLOT).map(r => r.id));
    repos = allRepos.filter(r => isRepoComplete(r) || slotted.has(r.id));
    log(`Worker slot ${WORKER_SLOT}/${TOTAL_SLOTS}: handling ${slotted.size} of ${incomplete.length} incomplete repos`, 'info');
  }

  if (repos.length === 0) {
    log('No enabled repos in queue', 'warning');
    return;
  }

  log(`Processing ${repos.length} repos in priority order`, 'info');
  for (const repo of repos) {
    log(`  ${repo.priority || '?'}. ${repo.name} (${repo.id})`, 'info');
  }

  status.startedAt = status.startedAt || new Date().toISOString();
  status.lastUpdated = new Date().toISOString();
  saveStatus(status);

  const startTime = Date.now();
  const totalDurationMs = TOTAL_HOURS ? TOTAL_HOURS * 60 * 60 * 1000 : null;

  for (const repo of repos) {
    // Check total time limit
    if (totalDurationMs && (Date.now() - startTime) >= totalDurationMs) {
      log('Total time limit reached', 'end');
      break;
    }

    // Skip completed repos
    if (isRepoComplete(repo)) {
      log(`Skipping ${repo.name} - already complete`, 'skip');
      if (!status.completedRepos.includes(repo.id)) {
        status.completedRepos.push(repo.id);
      }
      continue;
    }

    log(`\n${'='.repeat(60)}`, 'info');
    log(`Processing: ${repo.name} (Priority ${repo.priority || '?'})`, 'next');
    log(`${'='.repeat(60)}`, 'info');

    // Pre-flight: ensure a valid, non-empty feature list exists before spawning harness.
    // This prevents the 9K+ "Feature list is empty" crash loop.
    const featureListValid = () => {
      const fl = resolveFeatureList(repo);
      if (!fl || !fs.existsSync(fl)) return false;
      try {
        const d = JSON.parse(fs.readFileSync(fl, 'utf-8'));
        return Array.isArray(d.features) && d.features.length > 0;
      } catch { return false; }
    };

    if (!featureListValid()) {
      if (!repo.prd) {
        log(`Skipping ${repo.name} - no feature list and no PRD`, 'skip');
        continue;
      }
      log(`Feature list missing or empty for ${repo.name} — generating from PRD`, 'info');
      const generated = await generateFeaturesForRepo(repo);
      if (!generated || !featureListValid()) {
        log(`Feature generation failed for ${repo.name} — skipping to avoid crash loop`, 'warning');
        continue;
      }
      log(`Feature list generated for ${repo.name}`, 'success');
    }

    status.currentRepo = repo.id;
    status.lastUpdated = new Date().toISOString();
    saveStatus(status);

    const progressBefore = getRepoProgress(repo);
    writeHeartbeat(repo.id, progressBefore.passing);
    log(`Current progress: ${progressBefore.passing}/${progressBefore.total} (${progressBefore.percent}%)`, 'info');

    // Track session start in metrics DB
    const sessionId = await trackSessionStart(repo.id, repo.name, repo.path);

    // Calculate time for this repo
    let repoHours = HOURS_PER_REPO;
    if (totalDurationMs) {
      const remainingMs = totalDurationMs - (Date.now() - startTime);
      const remainingRepos = repos.length - repos.indexOf(repo);
      repoHours = Math.max(1, (remainingMs / remainingRepos) / (60 * 60 * 1000));
    }

    // Run the harness
    const result = await runRepoSession(repo, {
      hours: repoHours,
      maxSessions: queue.defaults?.maxSessionsPerRepo || 50,
      untilComplete: repo.untilComplete,
      queue: queue,  // Pass queue config for model tier selection
    });

    // Track session end in metrics DB
    const progressAfter = getRepoProgress(repo);
    await trackSessionEnd(sessionId, repo.id, result, progressBefore, progressAfter);

    if (result.complete) {
      log(`${repo.name} is now complete!`, 'success');
      if (!status.completedRepos.includes(repo.id)) {
        status.completedRepos.push(repo.id);
      }
    }

    status.lastUpdated = new Date().toISOString();
    saveStatus(status);

    // Git commit progress if enabled
    if (AUTO_COMMIT && result.progress && result.progress.passing > 0) {
      const commitMsg = `[harness] ${repo.name}: ${result.progress.passing}/${result.progress.total} features (${result.progress.percent}%)`;
      gitCommit(repo.path, commitMsg);
    }

    const progressAfterRepo = getRepoProgress(repo);
    writeHeartbeat(repo.id, progressAfterRepo.passing);

    // Brief pause between repos (configurable)
    if (repos.indexOf(repo) < repos.length - 1) {
      log(`Pausing ${INTER_REPO_DELAY_SEC} seconds before next repo...`, 'pause');
      await new Promise(r => setTimeout(r, INTER_REPO_DELAY_SEC * 1000));
    }
  }

  // Final summary
  log('\n' + '='.repeat(60), 'info');
  log('Queue Processing Complete', 'end');
  log('='.repeat(60), 'info');

  for (const repo of repos) {
    const progress = getRepoProgress(repo);
    const complete = isRepoComplete(repo);
    const icon = complete ? '✅' : '🔄';
    log(`${icon} ${repo.name}: ${progress.passing}/${progress.total} (${progress.percent}%)`, 'info');
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  status.currentRepo = null;
  status.lastUpdated = new Date().toISOString();
  saveStatus(status);

  // Loop mode: restart queue if enabled and not all complete
  if (LOOP_MODE) {
    const allComplete = repos.every(r => isRepoComplete(r));
    if (!allComplete) {
      log('Loop mode: restarting queue...', 'next');
      await new Promise(r => setTimeout(r, INTER_REPO_DELAY_SEC * 1000));
      return runQueue(); // Recursive call to restart
    } else {
      log('Loop mode: all repos complete, stopping', 'end');
    }
  }
}

// CLI
const args = process.argv.slice(2);

function getArgValue(name) {
  const eq = args.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Multi-Repo Queue Runner
========================

Chains multiple repos together, working through them by priority.

Usage:
  node run-queue.js [options]

Options:
  --queue PATH       Path to queue config file (default: ./repo-queue.json)
  --generate         Generate feature lists from PRDs before running
  --hours=N          Total hours to run across all repos
  --hours-per-repo=N Hours to spend on each repo
  --repo=ID          Only run a specific repo
  --dry-run          Show what would be done without executing
  --status           Show current queue status and exit
  --loop             Keep running queue until all repos complete
  --no-commit        Disable auto git commits after progress
  --delay=N          Seconds to pause between repos (default: 30)
  --help, -h         Show this help

Examples:
  node run-queue.js                          # Run queue with defaults
  node run-queue.js --generate               # Generate features then run
  node run-queue.js --hours=24               # Run for 24 hours total
  node run-queue.js --repo=gapradar          # Only run GapRadar
  node run-queue.js --status                 # Check status
`);
  process.exit(0);
}

// Parse arguments
QUEUE_FILE = getArgValue('--queue') || QUEUE_FILE;
GENERATE_FEATURES = args.includes('--generate');
DRY_RUN = args.includes('--dry-run');
FORCE_REPO = getArgValue('--repo');

const slotArg = getArgValue('--slot');
const totalSlotsArg = getArgValue('--total-slots');
if (slotArg !== null) WORKER_SLOT = parseInt(slotArg, 10);
if (totalSlotsArg !== null) TOTAL_SLOTS = parseInt(totalSlotsArg, 10);

const totalHours = getArgValue('--hours');
if (totalHours) TOTAL_HOURS = parseFloat(totalHours);

const hoursPerRepo = getArgValue('--hours-per-repo');
if (hoursPerRepo) HOURS_PER_REPO = parseFloat(hoursPerRepo);

LOOP_MODE = args.includes('--loop');
AUTO_COMMIT = !args.includes('--no-commit');

const delayArg = getArgValue('--delay');
if (delayArg) INTER_REPO_DELAY_SEC = parseInt(delayArg, 10);

// Status command
if (args.includes('--status')) {
  const queue = loadQueue();
  const status = loadStatus();

  console.log('\n📊 Queue Status\n');
  console.log(`Current repo: ${status.currentRepo || 'None'}`);
  console.log(`Started: ${status.startedAt || 'Never'}`);
  console.log(`Last updated: ${status.lastUpdated || 'Never'}`);
  console.log(`\nRepo Progress:`);

  const repos = queue.repos.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  for (const repo of repos) {
    const progress = getRepoProgress(repo);
    const complete = isRepoComplete(repo);
    const enabled = repo.enabled !== false ? '✓' : '✗';
    const status_icon = complete ? '✅' : (status.currentRepo === repo.id ? '🔄' : '⏳');
    console.log(`  ${status_icon} [${enabled}] P${repo.priority || '?'} ${repo.name}: ${progress.passing}/${progress.total} (${progress.percent}%)`);
  }
  console.log('');
  process.exit(0);
}

// Check for Claude CLI
try {
  execSync('which claude', { stdio: 'ignore' });
} catch (e) {
  log('Claude CLI not found. Please install Claude Code first.', 'error');
  process.exit(1);
}

// Run
runQueue().catch(e => {
  log(`Fatal error: ${e.message}`, 'error');
  process.exit(1);
});
