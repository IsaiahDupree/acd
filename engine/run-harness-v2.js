#!/usr/bin/env node

/**
 * Agent Harness Runner v2
 * =======================
 * 
 * Enhanced harness with:
 * - Intelligent error classification (auth vs rate limit vs transient)
 * - Exponential backoff with jitter
 * - Rate limit awareness
 * - Proper handling of authentication errors (stops retrying)
 * - Session metrics and reporting
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import * as metricsDb from './metrics-db.js';
import * as rateCoord from './rate-limit-coordinator.js';
import { createTelemetry } from './agent-telemetry.js';
import { PROMPTS_DIR, MCP_CONFIG, AGENTS_DIR } from './paths.js';
import { verifyTarget } from './verify-gate.js';
// Load TELEGRAM_* vars from actp-worker .env if not already set
if (!process.env.TELEGRAM_BOT_TOKEN) {
  try {
    const _envLines = fs.readFileSync('/Users/isaiahdupree/Documents/Software/actp-worker/.env', 'utf8').split('\n');
    for (const _line of _envLines) {
      const _m = _line.match(/^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)=(.+)$/);
      if (_m) process.env[_m[1]] = _m[2].trim().replace(/^['"]/,'').replace(/['"]$/,'');
    }
  } catch { /* env file missing — Telegram notifications disabled */ }
}
// ── Telegram proactive notifications ─────────────────────────────────────────
async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch (e) {
    // non-fatal — never crash harness over Telegram
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let PROJECT_ROOT = path.resolve(__dirname, '..');
let PROJECT_ID = 'default';
let PROMPT_OVERRIDE = null;
let INITIALIZER_PROMPT_OVERRIDE = null;
let FORCE_CODING = false;
let DURATION_MS = null;
let RATE_LIMIT_WAIT_MINUTES = 20;
let SESSION_DELAY_MINUTES = 5; // Default 5 min delay between successful sessions
let DEFAULT_CONTINUOUS = true; // Default to continuous mode
let UNTIL_COMPLETE = false; // Run until all features pass
let ADAPTIVE_DELAY = true; // Dynamically adjust delay based on rate limits

// ── Usage Budget Guardian ───────────────────────────────────────────────────
// Pauses the harness at 25%, 50%, 75%, 100% of daily budget
let DAILY_TOKEN_BUDGET = parseInt(process.env.ACD_DAILY_TOKEN_BUDGET || '0', 10);    // 0 = unlimited
let DAILY_COST_BUDGET  = parseFloat(process.env.ACD_DAILY_COST_BUDGET  || '0');      // 0 = unlimited
let BUDGET_PAUSE_MINUTES = parseInt(process.env.ACD_BUDGET_PAUSE_MINUTES || '30', 10); // pause duration at each checkpoint
const BUDGET_CHECKPOINTS = [0.25, 0.50, 0.75, 1.00]; // quarter-point thresholds

// Model fallback configuration
// Verified working model IDs (tested 2026-04-03)
// Priority: Sonnet first (cost-effective + fast), then Haiku, Opus only as last resort
const AVAILABLE_MODELS = [
  'claude-sonnet-4-6',            // Primary - Claude Sonnet 4.6 (latest, fast)
  'claude-sonnet-4-5-20250929',   // Fallback 1 - Claude Sonnet 4.5
  'claude-sonnet-4-5',            // Fallback 2 - Claude Sonnet 4.5 alias
  'claude-haiku-4-5-20251001',    // Fallback 3 - Claude Haiku 4.5 (fastest, lowest cost)
  'claude-haiku-4-5',             // Fallback 4 - Claude Haiku 4.5 alias
  'claude-opus-4-6',              // Fallback 5 - Claude Opus 4.6 (most capable, use sparingly)
  'claude-opus-4-5',              // Fallback 6 - Claude Opus 4.5
];
let currentModelIndex = 0;
let modelRateLimitStatus = {}; // Track rate limit status per model

// ── Agent capability packaging ───────────────────────────────────────────────
// Appended to the spawned coding agent's system prompt so it deterministically
// knows it has full Claude Code capability (delegation, MCP, skills, plan mode)
// regardless of what is inherited from ~/.claude.json.
const AGENT_CAPABILITY_PROMPT = [
  'You are a fully-capable Claude Code agent running inside the ACD harness.',
  'You have the complete Claude Code toolset and may use it freely:',
  '- DELEGATE work to subagents via the Task tool. Available subagent types include',
  '  Explore (codebase reconnaissance), Plan (design before coding), general-purpose',
  '  (multi-step implementation), and ui-tester (browser/UI verification). Fan out to',
  '  subagents for independent investigation or parallelizable work.',
  '- CALL MCP TOOLS that are configured for this run (supabase, vercel, playwright,',
  '  and any others provided via the --mcp-config). Prefer real integrations over mocks.',
  '- USE SKILLS (slash-command skills) when one matches the task at hand.',
  '- ENTER PLAN MODE for hard or ambiguous features: explore, form a plan, then execute.',
  'Implement features one at a time, verify each before marking it passing, and commit',
  'after each feature. Never fabricate data, stub returns, or weaken tests.',
].join('\n');

function createConfig(projectRoot, projectId) {
  const ns = projectId && projectId !== 'default' && projectId !== path.basename(projectRoot) ? `-${projectId}` : '';
  return {
    progressFile: path.join(projectRoot, `claude-progress${ns}.txt`),
    featureList: path.join(projectRoot, 'feature_list.json'),
    initScript: path.join(projectRoot, 'init.sh'),
    initializerPrompt: path.join(PROMPTS_DIR, 'initializer.md'),
    codingPrompt: path.join(PROMPTS_DIR, 'coding.md'),
    statusFile: path.join(projectRoot, `harness-status${ns}.json`),
    metricsFile: path.join(projectRoot, `harness-metrics${ns}.json`),
    outputLog: path.join(projectRoot, `harness-output${ns}.log`),

    // Session settings
    maxSessions: 100,

    // Rate limiting & backoff
    initialBackoffMs: 5000,        // Start with 5 second delay
    maxBackoffMs: 300000,          // Max 5 minute delay
    backoffMultiplier: 2,          // Double each failure
    jitterFactor: 0.2,             // 20% random jitter
    minSessionGapMs: 10000,        // Minimum 10s between sessions
    sessionDelayMs: 0,             // Configurable delay between sessions

    // Error handling
    maxConsecutiveErrors: 5,       // Stop after 5 consecutive errors
    authErrorPauseMinutes: 60,     // Pause 1 hour on auth errors
    rateLimitPauseMinutes: 2,      // Pause 2 minutes on rate limits
    adaptiveDelayMultiplier: 1.5,  // Multiply delay on rate limit warnings
    maxAdaptiveDelayMinutes: 5,    // Cap adaptive delay at 5 min
    minAdaptiveDelayMinutes: 2,    // Minimum cap for jitter range
    progressiveDelayStart: 1,      // Start progressive delay at 1 min
    progressiveDelayAfterSessions: 3, // Begin progressive delay after N sessions
  };
}

let CONFIG = createConfig(PROJECT_ROOT);

// ============================================
// Memory System Integration
// ============================================

/**
 * Write a memory event to the 3-layer memory system.
 * Non-blocking - session completes even if this fails.
 */
async function writeMemoryEvent(sessionNumber, stats, success) {
  try {
    const { passing, total } = stats;
    const passRate = total > 0 ? passing / total : 0;
    const pct = total > 0 ? Math.round(passRate * 100) : 0;

    // Calculate importance score based on pass rate
    let importanceScore = 5.0; // default
    if (passRate >= 0.8) {
      importanceScore = 7.5; // significant progress
    } else if (passRate >= 0.5) {
      importanceScore = 5.5; // normal progress
    } else {
      importanceScore = 4.0; // early progress
    }

    const event = {
      event_type: 'session_complete',
      content: `ACD session ${sessionNumber} for ${PROJECT_ID}: ${passing}/${total} features passing (${pct}%)`,
      importance_score: importanceScore,
      source: 'acd-harness',
      metadata: {
        slug: PROJECT_ID,
        session_number: sessionNumber,
        features_passed: passing,
        features_total: total,
        success
      }
    };

    // Write to Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      const payload = {
        ...event,
        created_at: new Date().toISOString()
      };

      await fetch(`${supabaseUrl}/rest/v1/actp_memory_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
    }

    // Append to daily note
    const vaultPath = process.env.MEMORY_VAULT_PATH || path.join(os.homedir(), '.memory', 'vault');
    const dailyNotesDir = path.join(vaultPath, 'DAILY-NOTES');

    if (fs.existsSync(vaultPath)) {
      const today = new Date().toISOString().split('T')[0];
      const dailyNotePath = path.join(dailyNotesDir, `${today}.md`);
      const timestamp = new Date().toTimeString().split(' ')[0].substring(0, 5);
      const entry = `\n## ACD Event: ${timestamp}\n**Type:** ${event.event_type}\n**Score:** ${importanceScore}\n${event.content}\n`;

      fs.mkdirSync(dailyNotesDir, { recursive: true });
      fs.appendFileSync(dailyNotePath, entry, 'utf8');
    }
  } catch (e) {
    // Non-blocking: log error but don't fail the session
    console.error(`Memory write failed (non-fatal): ${e.message}`);
  }
}

// ============================================
// Configuration
// ============================================

// NOTE: CONFIG is created dynamically via createConfig(projectRoot)

// ============================================
// Error Classification
// ============================================

const ErrorTypes = {
  AUTH_ERROR: 'auth_error',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  TRANSIENT: 'transient',
  CONFIG_ERROR: 'config_error',
  UNKNOWN: 'unknown',
};

function classifyError(output, exitCode) {
  const lowerOutput = output.toLowerCase();
  // Only check the tail of output for auth/error signals to avoid false
  // positives from content the agent wrote or discussed during the session.
  const tailLength = 3000;
  const lowerTail = output.slice(-tailLength).toLowerCase();
  
  // Rate limiting - check FIRST (takes priority over auth since rate limit
  // responses can sometimes include 'unauthorized' or similar words)
  if (
    lowerTail.includes('rate limit') ||
    lowerTail.includes('429') ||
    lowerTail.includes('too many requests') ||
    lowerTail.includes('overloaded') ||
    lowerTail.includes('hit your limit') ||
    lowerTail.includes('resets')
  ) {
    return ErrorTypes.RATE_LIMIT;
  }
  
  // Authentication errors - only match against tail of output with strict patterns
  // to avoid false positives from code/discussion in session body
  const authPatterns = [
    'invalid api key',
    'invalid_api_key',
    'authentication_failed',
    '"error":"authentication_failed"',
    'invalid x-api-key',
    'api key is invalid',
    'could not authenticate',
    'invalid authorization',
  ];
  const hasAuthError = authPatterns.some(p => lowerTail.includes(p));
  // Only classify as auth if "unauthorized" appears in a structured error context
  // (not just anywhere in discussion)
  const hasUnauthorized = lowerTail.includes('401') && lowerTail.includes('unauthorized');
  if (hasAuthError || hasUnauthorized) {
    return ErrorTypes.AUTH_ERROR;
  }
  
  // Server errors - retry with backoff (check tail only)
  if (
    lowerTail.includes('500 internal') ||
    lowerTail.includes('502 bad gateway') ||
    lowerTail.includes('503 service') ||
    lowerTail.includes('504 gateway') ||
    lowerTail.includes('internal server error')
  ) {
    return ErrorTypes.SERVER_ERROR;
  }
  
  // Config errors - don't retry
  if (
    lowerTail.includes('file not found') ||
    lowerTail.includes('enoent') ||
    lowerTail.includes('prompt file not found')
  ) {
    return ErrorTypes.CONFIG_ERROR;
  }
  
  // Network/transient - retry quickly
  if (
    lowerTail.includes('econnrefused') ||
    lowerTail.includes('econnreset') ||
    lowerTail.includes('timeout') ||
    lowerTail.includes('network error')
  ) {
    return ErrorTypes.TRANSIENT;
  }
  
  return ErrorTypes.UNKNOWN;
}

// ============================================
// Backoff Calculation
// ============================================

function calculateBackoff(attempts, errorType) {
  // Auth and config errors should not retry
  if (errorType === ErrorTypes.AUTH_ERROR) {
    return CONFIG.authErrorPauseMinutes * 60 * 1000;
  }
  
  if (errorType === ErrorTypes.CONFIG_ERROR) {
    return Infinity; // Don't retry
  }
  
  // Rate limits get longer pause
  if (errorType === ErrorTypes.RATE_LIMIT) {
    const base = CONFIG.rateLimitPauseMinutes * 60 * 1000;
    return base * Math.pow(1.5, attempts - 1);
  }
  
  // Exponential backoff for other errors
  const baseBackoff = CONFIG.initialBackoffMs * 
    Math.pow(CONFIG.backoffMultiplier, attempts - 1);
  
  const backoff = Math.min(baseBackoff, CONFIG.maxBackoffMs);
  
  // Add jitter to prevent thundering herd
  const jitter = backoff * CONFIG.jitterFactor * Math.random();
  
  return Math.floor(backoff + jitter);
}

function parseResetTimeFromOutput(output) {
  // Matches formats like:
  // - "resets 3pm"
  // - "resets at 3pm"
  // - "resets 3:30pm"
  const match = output.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3].toLowerCase();

  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;

  return { hour, minute };
}

function calculateRateLimitWaitMs(output) {
  const reset = parseResetTimeFromOutput(output);
  if (!reset) return null;

  const now = new Date();
  const target = new Date(now);
  target.setHours(reset.hour, reset.minute, 0, 0);

  // If the reset time already passed today, schedule for tomorrow.
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  target.setMinutes(target.getMinutes() + RATE_LIMIT_WAIT_MINUTES);

  const waitMs = target.getTime() - now.getTime();
  return waitMs > 0 ? waitMs : null;
}

// ============================================
// Model Fallback Logic
// ============================================

function getCurrentModel() {
  return AVAILABLE_MODELS[currentModelIndex];
}

function markModelRateLimited(model) {
  modelRateLimitStatus[model] = {
    rateLimited: true,
    rateLimitedAt: Date.now(),
    resetTime: null,
  };
  log(`Model ${model} marked as rate-limited`, 'rate');
}

function isModelAvailable(model) {
  const status = modelRateLimitStatus[model];
  if (!status || !status.rateLimited) return true;
  
  // Check if 30 minutes have passed (assume rate limit expired)
  const timeSinceLimit = Date.now() - status.rateLimitedAt;
  if (timeSinceLimit > 30 * 60 * 1000) {
    status.rateLimited = false;
    log(`Model ${model} rate limit assumed expired`, 'info');
    return true;
  }
  return false;
}

function getNextAvailableModel() {
  // Try to find an available model starting from current index
  for (let i = 0; i < AVAILABLE_MODELS.length; i++) {
    const index = (currentModelIndex + i) % AVAILABLE_MODELS.length;
    const model = AVAILABLE_MODELS[index];
    if (isModelAvailable(model)) {
      return { model, index };
    }
  }
  return null; // All models rate limited
}

function switchToNextModel() {
  const current = getCurrentModel();
  markModelRateLimited(current);
  
  const next = getNextAvailableModel();
  if (next && next.model !== current) {
    currentModelIndex = next.index;
    log(`Switching from ${current} to ${next.model}`, 'info');
    return next.model;
  }
  
  log('All models rate-limited, will wait for reset', 'warning');
  return null;
}

function resetModelStatus() {
  // Called when a session succeeds - reset the current model's status
  const model = getCurrentModel();
  if (modelRateLimitStatus[model]) {
    modelRateLimitStatus[model].rateLimited = false;
  }
}

// ============================================
// Logging & Status
// ============================================

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
    rate: '🚦',
    auth: '🔐',
  }[level] || '•';

  const line = `${timestamp} ${prefix} ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(CONFIG.outputLog, line + '\n');
  } catch (e) {
    // ignore logging errors
  }
}

function isFirstRun() {
  const hasProgress = fs.existsSync(CONFIG.progressFile);
  const hasFeatures = fs.existsSync(CONFIG.featureList);
  
  if (!hasProgress || !hasFeatures) {
    log('First run detected - no progress or feature files found');
    return true;
  }
  
  try {
    const features = JSON.parse(fs.readFileSync(CONFIG.featureList, 'utf-8'));
    if (!features.features || features.features.length === 0) {
      log('Feature list is empty - treating as first run');
      return true;
    }
  } catch (e) {
    log('Could not parse feature list - treating as first run', 'warning');
    return true;
  }
  
  return false;
}

function validateFeatureList() {
  if (!fs.existsSync(CONFIG.featureList)) {
    return { valid: false, error: 'Feature list file not found' };
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG.featureList, 'utf-8'));
    if (!data.features || !Array.isArray(data.features)) {
      return { valid: false, error: 'Feature list missing "features" array' };
    }
    if (data.features.length === 0) {
      return { valid: false, error: 'Feature list is empty' };
    }
    // Check for required fields in first feature (name or description accepted)
    const sample = data.features[0];
    if (!sample.id || (!sample.name && !sample.description)) {
      return { valid: false, error: 'Features missing required fields (id, name or description)' };
    }
    return { valid: true, features: data.features.length };
  } catch (e) {
    return { valid: false, error: `Failed to parse feature list: ${e.message}` };
  }
}

function getProgressStats() {
  if (!fs.existsSync(CONFIG.featureList)) {
    return { total: 0, passing: 0, pending: 0, percentComplete: 0 };
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG.featureList, 'utf-8'));
    const features = data.features || [];
    const total = features.length;
    const passing = features.filter(f => f.passes).length;
    
    return {
      total,
      passing,
      pending: total - passing,
      percentComplete: total > 0 ? ((passing / total) * 100).toFixed(1) : 0
    };
  } catch (e) {
    return { total: 0, passing: 0, pending: 0, percentComplete: 0 };
  }
}

function updateStatus(sessionType, status, stats = null, extra = {}) {
  const statusData = {
    projectId: PROJECT_ID,
    projectRoot: PROJECT_ROOT,
    lastUpdated: new Date().toISOString(),
    sessionType,
    status,
    stats: stats || getProgressStats(),
    pid: process.pid,
    ...extra,
  };
  
  fs.writeFileSync(CONFIG.statusFile, JSON.stringify(statusData, null, 2));
}

function loadMetrics() {
  const defaultMetrics = {
    totalSessions: 0,
    successfulSessions: 0,
    failedSessions: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    rateLimitHits: 0,
    authErrors: 0,
    consecutiveErrors: 0,
    lastSessionTime: null,
    featuresCompletedThisRun: 0,
    startingFeatures: 0,
    avgSessionDuration: 0,
  };
  
  if (!fs.existsSync(CONFIG.metricsFile)) {
    return defaultMetrics;
  }
  
  try {
    return { ...defaultMetrics, ...JSON.parse(fs.readFileSync(CONFIG.metricsFile, 'utf-8')) };
  } catch (e) {
    return defaultMetrics;
  }
}

function saveMetrics(metrics) {
  fs.writeFileSync(CONFIG.metricsFile, JSON.stringify(metrics, null, 2));
}

// ============================================
// Usage Budget Guardian
// ============================================

const CLAUDE_USAGE_FILE = path.join(__dirname, 'claude-usage.json');
const USAGE_SCRAPER = path.join(__dirname, 'scrape-claude-usage.sh');
let USAGE_PAUSE_THRESHOLD = parseInt(process.env.ACD_USAGE_PAUSE_AT || '75', 10); // pause ACD when Claude app usage hits this %
let USAGE_STOP_THRESHOLD = parseInt(process.env.ACD_USAGE_STOP_AT || '90', 10);   // stop ACD at this %
let USAGE_CHECK_INTERVAL_MS = parseInt(process.env.ACD_USAGE_CHECK_INTERVAL || '900000', 10); // 15 min default
let lastUsageScrapeAt = 0;

/**
 * Scrape Claude desktop app usage via screenshot + OCR.
 * Returns { session_percent, weekly_all_percent, weekly_sonnet_percent, max_weekly_percent, ... }
 * or null if scraping fails.
 */
function scrapeClaudeUsage() {
  // Rate limit: don't scrape more than once per interval
  if (Date.now() - lastUsageScrapeAt < USAGE_CHECK_INTERVAL_MS) {
    try {
      if (fs.existsSync(CLAUDE_USAGE_FILE)) {
        return JSON.parse(fs.readFileSync(CLAUDE_USAGE_FILE, 'utf-8'));
      }
    } catch { return null; }
  }

  try {
    log('Scraping Claude desktop usage...', 'info');
    execSync(`bash "${USAGE_SCRAPER}"`, { timeout: 60000, stdio: 'pipe' });
    lastUsageScrapeAt = Date.now();
    if (fs.existsSync(CLAUDE_USAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CLAUDE_USAGE_FILE, 'utf-8'));
      log(`Claude usage: session=${data.session_percent ?? '?'}% weekly_all=${data.weekly_all_percent ?? '?'}% sonnet=${data.weekly_sonnet_percent ?? '?'}%`, 'info');
      return data;
    }
  } catch (e) {
    log(`Usage scrape failed (non-fatal): ${e.message}`, 'warn');
  }
  return null;
}

/**
 * Check if Claude desktop app usage is too high to continue running ACD.
 * Returns { shouldPause, shouldStop, percent, message }
 */
function checkClaudeAppUsage() {
  const usage = scrapeClaudeUsage();
  if (!usage) return { shouldPause: false, shouldStop: false };

  // Use the highest weekly percentage as the primary signal
  const pct = usage.max_weekly_percent ?? usage.weekly_all_percent ?? usage.session_percent;
  if (pct == null) return { shouldPause: false, shouldStop: false };

  if (pct >= USAGE_STOP_THRESHOLD) {
    return {
      shouldPause: false,
      shouldStop: true,
      percent: pct,
      message: `Claude app usage at ${pct}% (stop threshold: ${USAGE_STOP_THRESHOLD}%)`,
    };
  }

  if (pct >= USAGE_PAUSE_THRESHOLD) {
    return {
      shouldPause: true,
      shouldStop: false,
      percent: pct,
      message: `Claude app usage at ${pct}% (pause threshold: ${USAGE_PAUSE_THRESHOLD}%)`,
    };
  }

  return { shouldPause: false, shouldStop: false, percent: pct };
}

const BUDGET_STATE_FILE = path.join(__dirname, 'budget-state.json');

function loadBudgetState() {
  const today = new Date().toISOString().slice(0, 10);
  const defaults = {
    date: today,
    tokensUsed: 0,
    costUsed: 0,
    checkpointsHit: [],  // e.g. [0.25, 0.50] = already paused at 25% and 50%
    pausedUntil: null,
  };
  try {
    if (fs.existsSync(BUDGET_STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(BUDGET_STATE_FILE, 'utf-8'));
      // Reset if new day
      if (state.date !== today) {
        log(`Budget guardian: new day detected (${state.date} → ${today}), resetting counters`, 'info');
        return defaults;
      }
      return { ...defaults, ...state };
    }
  } catch {}
  return defaults;
}

function saveBudgetState(state) {
  fs.writeFileSync(BUDGET_STATE_FILE, JSON.stringify(state, null, 2));
}

function budgetEnabled() {
  return DAILY_TOKEN_BUDGET > 0 || DAILY_COST_BUDGET > 0;
}

/**
 * Check usage against budget after a session completes.
 * Returns: { paused: boolean, checkpoint: number|null, pauseMs: number }
 */
async function checkBudgetGuardian(sessionTokens, sessionCost) {
  if (!budgetEnabled()) return { paused: false };

  const state = loadBudgetState();
  state.tokensUsed += sessionTokens;
  state.costUsed += sessionCost;

  // Calculate usage percentages
  const tokenPct = DAILY_TOKEN_BUDGET > 0 ? state.tokensUsed / DAILY_TOKEN_BUDGET : 0;
  const costPct  = DAILY_COST_BUDGET  > 0 ? state.costUsed  / DAILY_COST_BUDGET  : 0;
  const usagePct = Math.max(tokenPct, costPct);

  // Find the highest checkpoint we've crossed that we haven't paused for yet
  let hitCheckpoint = null;
  for (const cp of BUDGET_CHECKPOINTS) {
    if (usagePct >= cp && !state.checkpointsHit.includes(cp)) {
      hitCheckpoint = cp;
    }
  }

  if (hitCheckpoint !== null) {
    state.checkpointsHit.push(hitCheckpoint);
    const cpLabel = `${Math.round(hitCheckpoint * 100)}%`;
    const tokenLabel = DAILY_TOKEN_BUDGET > 0
      ? `${(state.tokensUsed / 1000).toFixed(0)}K / ${(DAILY_TOKEN_BUDGET / 1000).toFixed(0)}K tokens`
      : '';
    const costLabel = DAILY_COST_BUDGET > 0
      ? `$${state.costUsed.toFixed(2)} / $${DAILY_COST_BUDGET.toFixed(2)}`
      : '';
    const usageStr = [tokenLabel, costLabel].filter(Boolean).join(' · ');

    if (hitCheckpoint >= 1.0) {
      // 100% — hard stop
      log(`🛑 BUDGET GUARDIAN: Daily limit reached (${cpLabel}) — ${usageStr}`, 'error');
      log('Harness will stop. Adjust ACD_DAILY_TOKEN_BUDGET or ACD_DAILY_COST_BUDGET to increase.', 'info');
      notifyTelegram(`🛑 *Budget limit reached* (${cpLabel})\n${usageStr}\nHarness stopped for today.`).catch(() => {});
      saveBudgetState(state);
      return { paused: true, checkpoint: hitCheckpoint, pauseMs: Infinity, hardStop: true };
    }

    // 25%, 50%, 75% — pause then resume
    const pauseMs = BUDGET_PAUSE_MINUTES * 60 * 1000;
    state.pausedUntil = new Date(Date.now() + pauseMs).toISOString();
    saveBudgetState(state);

    log(`⏸️  BUDGET GUARDIAN: ${cpLabel} checkpoint — ${usageStr}`, 'warning');
    log(`Pausing ${BUDGET_PAUSE_MINUTES} minutes to cool down. Resume at ${state.pausedUntil}`, 'info');
    notifyTelegram(
      `⏸️ *Budget checkpoint ${cpLabel}*\n${usageStr}\nPausing ${BUDGET_PAUSE_MINUTES}min · resumes ${new Date(Date.now() + pauseMs).toLocaleTimeString()}`
    ).catch(() => {});

    return { paused: true, checkpoint: hitCheckpoint, pauseMs, hardStop: false };
  }

  // No checkpoint hit — save updated counters and continue
  saveBudgetState(state);
  return { paused: false };
}

// ============================================
// Session Execution
// ============================================

function getPrompt() {
  const shouldUseInitializer = !FORCE_CODING && isFirstRun();
  const promptFile = shouldUseInitializer
    ? (INITIALIZER_PROMPT_OVERRIDE || CONFIG.initializerPrompt)
    : (PROMPT_OVERRIDE || CONFIG.codingPrompt);
  
  if (!fs.existsSync(promptFile)) {
    throw new Error(`Prompt file not found: ${promptFile}`);
  }
  
  let promptContent = fs.readFileSync(promptFile, 'utf-8');

  // Strip YAML frontmatter (---...---) so it doesn't get interpreted as a CLI flag
  promptContent = promptContent.replace(/^---\n[\s\S]*?\n---\n*/, '');

  // When using a custom feature list (not the project-root default), append
  // tracking instructions so Claude knows the exact path and how to mark done.
  const defaultFeatureList = path.join(PROJECT_ROOT, 'feature_list.json');
  if (CONFIG.featureList !== defaultFeatureList && fs.existsSync(CONFIG.featureList)) {
    const features = JSON.parse(fs.readFileSync(CONFIG.featureList, 'utf-8')).features || [];
    const pending = features.filter(f => !f.passes);
    const pendingIds = pending.map(f => f.id).join(', ');
    promptContent += `\n\n---\n## Feature Tracking (REQUIRED)\n\nYour feature list is at:\n\`${CONFIG.featureList}\`\n\n**Pending feature IDs**: ${pendingIds || '(none — all done!)'}\n\nAfter implementing and testing each feature:\n1. Read the JSON at the path above\n2. Find the matching feature by \`id\`\n3. Set \`"passes": true\` and \`"status": "completed"\` on it\n4. Write the updated JSON back to that exact file path\n\nDo this for EVERY feature you complete in this session. The harness measures progress by counting \`passes: true\` entries in that file.\n`;
  }

  return promptContent;
}

function parseSessionOutput(output) {
  // Extract token usage from JSON output
  const metrics = {
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
  };
  
  try {
    // Look for result JSON lines
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('"type":"result"')) {
        const data = JSON.parse(line);
        if (data.usage) {
          metrics.inputTokens = (data.usage.input_tokens || 0) + 
            (data.usage.cache_creation_input_tokens || 0);
          metrics.outputTokens = data.usage.output_tokens || 0;
        }
        if (data.total_cost_usd) {
          metrics.cost = data.total_cost_usd;
        }
      }
    }
  } catch (e) {
    // Ignore parsing errors
  }
  
  return metrics;
}

async function runSession(sessionNumber, modelOverride = null) {
  const sessionType = (!FORCE_CODING && isFirstRun()) ? 'INITIALIZER' : 'CODING';
  const stats = getProgressStats();
  const model = modelOverride || getCurrentModel();
  
  log(`Starting session #${sessionNumber} (${sessionType}) with model: ${model}`, 'start');
  log(`Progress: ${stats.passing}/${stats.total} features (${stats.percentComplete}%)`);
  
  updateStatus(sessionType, 'running', stats, { currentSession: sessionNumber, model });

  // Telemetry: session start
  const telemetry = createTelemetry(PROJECT_ID);
  telemetry.emit('session_start', {
    session: sessionNumber,
    model,
    featuresTotal: stats.total,
    featuresPassing: stats.passing,
  });
  notifyTelegram(`🚀 *Agent started* \`${PROJECT_ID}\`\nSession #${sessionNumber} · ${stats.passing}/${stats.total} features (${stats.percentComplete}%) · model: ${model}`).catch(()=>{});

  // Start DB session tracking
  let dbSession = null;
  try {
    await metricsDb.ensureTarget(PROJECT_ID, path.basename(PROJECT_ROOT), PROJECT_ROOT);
    dbSession = await metricsDb.startSession(PROJECT_ID, sessionNumber, sessionType.toLowerCase(), model);
    log(`DB session started: ${dbSession?.id}`, 'info');
  } catch (e) {
    log(`DB session tracking failed (non-fatal): ${e.message}`, 'warn');
  }

  return new Promise((resolve, reject) => {
    
    let prompt;
    try {
      prompt = getPrompt();
    } catch (e) {
      reject(e);
      return;
    }
    
    const args = [
      '-p', prompt,
      '--model', model,
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--verbose'
    ];

    // ── Package full Claude Code capability deterministically ──────────────
    // Give the spawned coding agent MCP servers, custom subagents, and explicit
    // capability guidance instead of relying on whatever is inherited from
    // ~/.claude.json. Each flag is only added when its referenced path exists at
    // spawn time so a missing .mcp.json / agents dir never breaks the spawn.
    try {
      if (fs.existsSync(MCP_CONFIG)) {
        args.push('--mcp-config', MCP_CONFIG);
      } else {
        log(`MCP config not found at ${MCP_CONFIG} — spawning without --mcp-config`, 'info');
      }
      if (fs.existsSync(AGENTS_DIR)) {
        args.push('--agents', AGENTS_DIR);
      } else {
        log(`Agents dir not found at ${AGENTS_DIR} — spawning without --agents`, 'info');
      }
    } catch (e) {
      log(`Capability flag check failed (non-fatal): ${e.message}`, 'warn');
    }
    args.push('--append-system-prompt', AGENT_CAPABILITY_PROMPT);

    const startTime = Date.now();
    let output = '';
    const OUTPUT_TIMEOUT_MS = parseInt(process.env.OUTPUT_TIMEOUT_MS || '900000', 10); // 15 min silence → kill
    const MAX_SESSION_MS = parseInt(process.env.MAX_SESSION_MS || '7200000', 10);       // 2 hr hard wall
    let lastOutputAt = Date.now();
    let silenceTimer = setInterval(() => {
      const silenceMs = Date.now() - lastOutputAt;
      const wallMs    = Date.now() - startTime;

      // Hard wall-clock limit — kill regardless of output
      if (wallMs >= MAX_SESSION_MS) {
        const wallMin = (wallMs / 60000).toFixed(0);
        log(`⏱️  Session #${sessionNumber} hit ${wallMin}min wall limit — killing`, 'error');
        notifyTelegram(`🛑 *Session killed (wall limit)* \`${PROJECT_ID}\`\nRunning ${wallMin}min — terminated`).catch(()=>{});
        telemetry.emit('wall_limit_kill', { session: sessionNumber, wallMs });
        claude.kill('SIGTERM');
        setTimeout(() => { try { claude.kill('SIGKILL'); } catch { /* ok */ } }, 5000);
        return;
      }

      // Silence timeout — kill if no output for OUTPUT_TIMEOUT_MS
      if (silenceMs >= OUTPUT_TIMEOUT_MS) {
        const silenceMin = (silenceMs / 60000).toFixed(0);
        log(`🔇 Session #${sessionNumber} silent for ${silenceMin}min — killing`, 'error');
        telemetry.emit('stuck_detected', {
          reason: `No stdout for ${silenceMin} minutes`,
          lastProgressMs: silenceMs,
        });
        notifyTelegram(`🛑 *Agent killed (silent ${silenceMin}min)* \`${PROJECT_ID}\`\nSession #${sessionNumber} · ${stats.passing}/${stats.total} features`).catch(()=>{});
        claude.kill('SIGTERM');
        setTimeout(() => { try { claude.kill('SIGKILL'); } catch { /* ok */ } }, 5000);
      }
    }, 60000); // check every minute

    // Build env: always use Claude OAuth auth, never API key
    const claudeEnv = { ...process.env };
    delete claudeEnv.ANTHROPIC_API_KEY; // strip API key — force OAuth/Claude auth
    delete claudeEnv.CLAUDECODE; // allow nested claude sessions from watchdog/harness
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      claudeEnv.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }

    const claude = spawn('claude', args, {
      cwd: PROJECT_ROOT,
      env: claudeEnv,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    claude.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      lastOutputAt = Date.now();
      process.stdout.write(text);
      try {
        fs.appendFileSync(CONFIG.outputLog, text);
      } catch (e) {
        // ignore logging errors
      }
    });
    
    claude.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(data);
      try {
        fs.appendFileSync(CONFIG.outputLog, text);
      } catch (e) {
        // ignore logging errors
      }
    });
    
    claude.on('error', (error) => {
      log(`Failed to start Claude: ${error.message}`, 'error');
      updateStatus(sessionType, 'error', stats);
      reject(error);
    });
    
    claude.on('close', async (code) => {
      clearInterval(silenceTimer);
      const durationMs = Date.now() - startTime;
      const duration = (durationMs / 1000 / 60).toFixed(1);
      const newStats = getProgressStats();
      const sessionMetrics = parseSessionOutput(output);

      // Telemetry: emit feature_passed for each newly completed feature
      const featuresDelta = Math.max(0, newStats.passing - stats.passing);
      if (featuresDelta > 0) {
        telemetry.emit('feature_passed', { session: sessionNumber, featuresDelta, newPassing: newStats.passing });
        notifyTelegram(`✅ *+${featuresDelta} feature${featuresDelta>1?'s':''} passed* · \`${PROJECT_ID}\`\n${newStats.passing}/${newStats.total} total (${newStats.percentComplete}%)`).catch(()=>{});
      }
      telemetry.emit('session_end', {
        session: sessionNumber,
        duration_ms: durationMs,
        featuresDelta,
        tokens: (sessionMetrics.inputTokens || 0) + (sessionMetrics.outputTokens || 0),
        cost: sessionMetrics.cost || 0,
        exitCode: code,
      });
      const exitIcon = code === 0 ? '🏁' : '❌';
      notifyTelegram(`${exitIcon} *Session #${sessionNumber} ended* · \`${PROJECT_ID}\`\n${newStats.passing}/${newStats.total} features · ${duration}min · exit ${code}`).catch(()=>{});

      // End DB session tracking
      if (dbSession?.id) {
        try {
          const featuresCompleted = Math.max(0, newStats.passing - stats.passing);
          
          // Parse detailed metrics from output
          const turnCount = (output.match(/"num_turns":\s*(\d+)/)?.[1]) || 0;
          const apiLatency = sessionMetrics.apiLatencyMs || durationMs;
          
          await metricsDb.endSession(dbSession.id, {
            status: code === 0 ? 'completed' : 'failed',
            inputTokens: sessionMetrics.inputTokens || 0,
            outputTokens: sessionMetrics.outputTokens || 0,
            cacheReadTokens: sessionMetrics.cacheReadTokens || 0,
            cacheWriteTokens: sessionMetrics.cacheWriteTokens || 0,
            costUsd: sessionMetrics.cost || 0,
            featuresBefore: stats.passing,
            featuresAfter: newStats.passing,
            featuresCompleted,
            errorType: code !== 0 ? classifyError(output, code) : null,
            errorMessage: code !== 0 ? output.slice(-500) : null,
            wallClockMs: durationMs,
            apiLatencyMs: apiLatency,
            turnCount: parseInt(turnCount) || 0,
            retryCount: sessionMetrics.retryCount || 0,
            modelFallbacks: sessionMetrics.modelFallbacks || 0,
          });
          
          const cacheHitRate = sessionMetrics.cacheReadTokens > 0 
            ? ((sessionMetrics.cacheReadTokens / (sessionMetrics.inputTokens + sessionMetrics.cacheReadTokens)) * 100).toFixed(1)
            : 0;
          log(`DB session ended: ${featuresCompleted} features, ${turnCount} turns, ${cacheHitRate}% cache hit`, 'info');
          
          // Sync target progress to DB
          await metricsDb.syncTargetProgress(PROJECT_ID, newStats.passing, newStats.total);
          log(`DB target synced: ${newStats.passing}/${newStats.total} (${newStats.percentComplete}%)`, 'info');
          
          // Update daily stats
          await metricsDb.updateDailyStats(PROJECT_ID, newStats.total);
        } catch (e) {
          log(`DB session end failed (non-fatal): ${e.message}`, 'warn');
        }
      }
      
      if (code === 0) {
        log(`Session #${sessionNumber} completed in ${duration} minutes`, 'success');
        log(`Progress: ${newStats.passing}/${newStats.total} features (${newStats.percentComplete}%)`);
        updateStatus(sessionType, 'completed', newStats);
        resetModelStatus(); // Model worked, clear any rate limit status

        // Write to memory system (non-blocking)
        writeMemoryEvent(sessionNumber, newStats, true).catch(e =>
          console.error(`Memory write failed: ${e.message}`)
        );

        resolve({
          code,
          output,
          stats: newStats,
          duration,
          metrics: sessionMetrics,
          success: true,
          model,
        });
      } else {
        const errorType = classifyError(output, code);
        log(`Session #${sessionNumber} exited with code ${code} (${errorType})`, 'error');
        updateStatus(sessionType, 'failed', newStats, { errorType, model });

        // Write to memory system (non-blocking)
        writeMemoryEvent(sessionNumber, newStats, false).catch(e =>
          console.error(`Memory write failed: ${e.message}`)
        );

        resolve({
          code,
          output,
          stats: newStats,
          duration,
          metrics: sessionMetrics,
          success: false,
          errorType,
          model,
        });
      }
    });
  });
}

function isProjectComplete() {
  const stats = getProgressStats();
  return stats.total > 0 && stats.passing === stats.total;
}

// Track gate outcome so we don't run an expensive build/test on every loop tick
// while the gate is failing — only re-run after a session has made progress.
let lastGatedPassingCount = -1;

/**
 * Best-effort verification gate. Before we declare a run "complete" (all features
 * marked passing), actually run the target's build/test if one exists. If the gate
 * RAN and FAILED, we refuse to call the run complete (return false) so the harness
 * keeps iterating — the features may be marked passing but the project doesn't
 * actually build/test green. If no build/test exists, the gate is a no-op pass.
 */
async function confirmCompleteWithGate() {
  if (!isProjectComplete()) return false;

  const stats = getProgressStats();
  // Avoid re-running the gate repeatedly with no intervening progress.
  if (stats.passing === lastGatedPassingCount) {
    log('Verification gate already failed at this progress level — continuing to iterate', 'warning');
    return false;
  }

  log('All features marked passing — running verification gate (build/test)...', 'info');
  let gate;
  try {
    gate = await verifyTarget(PROJECT_ROOT);
  } catch (e) {
    log(`Verification gate error (treating as pass, non-fatal): ${e.message}`, 'warn');
    return true;
  }

  if (!gate.ran) {
    log('No build/test detected — verification gate is a no-op pass', 'info');
    return true;
  }
  if (gate.passed) {
    log('Verification gate PASSED — run is genuinely complete', 'success');
    notifyTelegram(`✅ *Verification gate passed* · \`${PROJECT_ID}\`\nbuild/test green — run complete`).catch(() => {});
    return true;
  }

  // Gate ran and failed — do NOT conclude success.
  lastGatedPassingCount = stats.passing;
  const tail = (gate.output || '').slice(-400).replace(/\n/g, ' ').trim();
  log(`⚠️  Verification gate FAILED — features marked passing but build/test is red. Continuing to iterate.`, 'warning');
  if (tail) log(`Gate output tail: ${tail}`, 'info');
  notifyTelegram(`⚠️ *Verification gate failed* · \`${PROJECT_ID}\`\nFeatures marked passing but build/test is red — agent will keep working.`).catch(() => {});
  updateStatus('SYSTEM', 'verify_failed', stats, {
    message: 'Verification gate failed — features passing but build/test red',
  });
  return false;
}

// ============================================
// Main Harness Loop
// ============================================

async function runHarness(options = {}) {
  const { maxSessions = CONFIG.maxSessions, continuous = false } = options;
  
  log('Agent Harness v2 Starting', 'start');
  rateCoord.register(PROJECT_ID);
  process.on('exit', () => rateCoord.deregister());
  process.on('SIGINT', () => { rateCoord.deregister(); process.exit(0); });
  process.on('SIGTERM', () => { rateCoord.deregister(); process.exit(0); });
  log(`Project root: ${PROJECT_ROOT}`);
  log(`Max sessions: ${maxSessions}`);
  log(`Mode: ${UNTIL_COMPLETE ? 'Until complete' : (continuous ? 'Continuous' : 'Single session')}`);
  if (continuous && SESSION_DELAY_MINUTES > 0) {
    log(`Session delay: ${SESSION_DELAY_MINUTES} minutes between sessions`, 'info');
  }
  if (ADAPTIVE_DELAY) {
    log(`Adaptive delay: enabled (sawtooth ${CONFIG.progressiveDelayStart}-${CONFIG.maxAdaptiveDelayMinutes} min)`, 'info');
  }
  
  // Validate feature list before starting
  const validation = validateFeatureList();
  if (!validation.valid) {
    log(`Feature list validation failed: ${validation.error}`, 'error');
    log(`Expected at: ${CONFIG.featureList}`, 'info');
    process.exit(1);
  }
  log(`Feature list validated: ${validation.features} features`, 'success');
  
  log(`Backoff: ${CONFIG.initialBackoffMs}ms - ${CONFIG.maxBackoffMs}ms`);
  if (DURATION_MS) {
    log(`Duration limit: ${(DURATION_MS / 1000 / 60).toFixed(1)} minutes`, 'info');
  }
  log(`Rate limit reset wait: ${RATE_LIMIT_WAIT_MINUTES} minutes after reset`, 'info');
  log(`Usage guardian: pause at ${USAGE_PAUSE_THRESHOLD}%, stop at ${USAGE_STOP_THRESHOLD}% (scrapes Claude app every ${Math.round(USAGE_CHECK_INTERVAL_MS / 60000)}min)`, 'info');
  // Initial usage check
  const initialUsage = scrapeClaudeUsage();
  if (initialUsage) {
    log(`Current Claude usage: session=${initialUsage.session_percent ?? '?'}% weekly=${initialUsage.max_weekly_percent ?? '?'}% plan=${initialUsage.plan ?? '?'}`, 'info');
  }
  if (budgetEnabled()) {
    const parts = [];
    if (DAILY_TOKEN_BUDGET > 0) parts.push(`${(DAILY_TOKEN_BUDGET / 1000).toFixed(0)}K tokens`);
    if (DAILY_COST_BUDGET > 0) parts.push(`$${DAILY_COST_BUDGET.toFixed(2)}`);
    const budgetState = loadBudgetState();
    const alreadyUsed = [];
    if (DAILY_TOKEN_BUDGET > 0) alreadyUsed.push(`${(budgetState.tokensUsed / 1000).toFixed(0)}K tokens`);
    if (DAILY_COST_BUDGET > 0) alreadyUsed.push(`$${budgetState.costUsed.toFixed(2)}`);
    log(`Budget guardian: ${parts.join(' / ')} daily limit, pause ${BUDGET_PAUSE_MINUTES}min at each 25% checkpoint`, 'info');
    if (budgetState.checkpointsHit.length > 0) {
      log(`  Already hit today: ${budgetState.checkpointsHit.map(c => Math.round(c * 100) + '%').join(', ')} (used ${alreadyUsed.join(' / ')})`, 'info');
    }
  }

  const endTimeMs = DURATION_MS ? (Date.now() + DURATION_MS) : null;
  
  let metrics = loadMetrics();
  let sessionNumber = 1;
  let consecutiveErrors = 0;
  // Auth failures are tracked SEPARATELY from consecutiveErrors so a couple of
  // transient auth hiccups (gateway blips, model-specific token issues) don't
  // get conflated with general session errors. Only N consecutive AUTH-specific
  // failures trigger the hard stop.
  let authFailures = 0;
  const MAX_AUTH_FAILURES = parseInt(process.env.ACD_MAX_AUTH_FAILURES || '3', 10);
  let currentSessionDelay = SESSION_DELAY_MINUTES; // Adaptive delay tracking
  
  while (sessionNumber <= maxSessions) {
    // Skip time check if running until complete
    if (!UNTIL_COMPLETE && endTimeMs && Date.now() >= endTimeMs) {
      const stats = getProgressStats();
      updateStatus('SYSTEM', 'duration_reached', stats, { message: 'Duration limit reached' });
      log('Duration limit reached - stopping harness', 'end');
      break;
    }

    // Check if already complete (gated by the verification build/test)
    if (isProjectComplete()) {
      if (await confirmCompleteWithGate()) {
        log('All features implemented! Project complete.', 'success');
        break;
      }
      // Gate failed — features marked passing but build/test red. Keep iterating.
    }

    try {
      // ── Claude app usage check (before each session) ──────────
      const appUsage = checkClaudeAppUsage();
      if (appUsage.shouldStop) {
        log(`🛑 ${appUsage.message} — stopping harness to preserve your interactive usage`, 'error');
        notifyTelegram(`🛑 *ACD stopped* — Claude app at ${appUsage.percent}% usage`).catch(() => {});
        updateStatus('SYSTEM', 'usage_limit', getProgressStats(), { message: appUsage.message });
        break;
      }
      if (appUsage.shouldPause) {
        const pauseMin = BUDGET_PAUSE_MINUTES;
        log(`⏸️  ${appUsage.message} — pausing ${pauseMin}min`, 'warning');
        notifyTelegram(`⏸️ *ACD paused* — Claude app at ${appUsage.percent}%, waiting ${pauseMin}min`).catch(() => {});
        updateStatus('SYSTEM', 'usage_pause', getProgressStats(), {
          message: appUsage.message,
          resumeAt: new Date(Date.now() + pauseMin * 60000).toISOString(),
        });
        await new Promise(r => setTimeout(r, pauseMin * 60000));
        log('Usage pause complete — rechecking...', 'info');
        continue; // Re-check usage before starting session
      }

      // Check if any peer process has broadcast a global rate limit
      const coordWait = await rateCoord.waitIfRateLimited(msg => log(msg, 'rate'));
      if (coordWait > 0) {
        log(`Resumed after ${(coordWait / 60000).toFixed(1)}m global backoff`, 'info');
      }

      const result = await runSession(sessionNumber);
      
      // Update metrics
      metrics.totalSessions++;
      metrics.lastSessionTime = new Date().toISOString();
      
      if (result.success) {
        metrics.successfulSessions++;
        consecutiveErrors = 0;
        authFailures = 0; // any successful session clears the auth-failure streak
        metrics.consecutiveErrors = 0;
        rateCoord.reportSuccess(getCurrentModel()).catch(() => {});
        
        if (result.metrics) {
          metrics.totalTokens += (result.metrics.inputTokens + result.metrics.outputTokens);
        }
      } else {
        metrics.failedSessions++;
        consecutiveErrors++;
        metrics.consecutiveErrors = consecutiveErrors;
        
        // Any non-auth failure breaks the consecutive AUTH-failure streak.
        if (result.errorType !== ErrorTypes.AUTH_ERROR) {
          authFailures = 0;
        }

        // Handle different error types
        switch (result.errorType) {
          case ErrorTypes.AUTH_ERROR:
            metrics.authErrors++;
            authFailures++; // dedicated counter, decoupled from consecutiveErrors

            // Auth errors retry with a pause — transient auth failures
            // (e.g. API gateway hiccup, temporary token issue) are common enough
            // that hard-stopping on the first occurrence is too aggressive. Only
            // stop after MAX_AUTH_FAILURES *consecutive AUTH-specific* failures.
            if (authFailures < MAX_AUTH_FAILURES) {
              const authRetryMinutes = 3;
              log(`Possible auth error (auth attempt ${authFailures}/${MAX_AUTH_FAILURES}) — retrying in ${authRetryMinutes} min`, 'auth');
              log(`Tail of output: ${result.output.slice(-300).replace(/\n/g, ' ').trim()}`, 'info');

              // Try switching models first — auth errors can be model-specific
              const authFallback = switchToNextModel();
              if (authFallback) {
                log(`Switching to ${authFallback} for auth retry`, 'info');
              }

              updateStatus('error', 'auth_retry', result.stats || getProgressStats(), {
                message: `Auth error — retrying (${authFailures}/${MAX_AUTH_FAILURES})`,
                errorType: result.errorType,
                resumeAt: new Date(Date.now() + authRetryMinutes * 60 * 1000).toISOString(),
              });
              saveMetrics(metrics);
              await new Promise(r => setTimeout(r, authRetryMinutes * 60 * 1000));
              sessionNumber++;
              continue; // Retry the loop
            }

            // After MAX_AUTH_FAILURES consecutive auth errors, stop
            log(`Authentication failed after ${authFailures} consecutive auth errors — stopping harness.`, 'auth');
            log('Set ANTHROPIC_API_KEY environment variable with a valid key.', 'info');
            log(`Last output tail: ${result.output.slice(-500).replace(/\n/g, ' ').trim()}`, 'info');
            updateStatus('error', 'auth_failed', null, {
              message: 'Invalid API key after retries — harness stopped',
              errorType: result.errorType,
              authErrorCount: metrics.authErrors,
            });
            saveMetrics(metrics);
            process.exit(1);
            break;

          case ErrorTypes.CONFIG_ERROR:
            log('Configuration error - stopping harness.', 'error');
            updateStatus('error', 'config_failed', null, { 
              message: 'Configuration error',
              errorType: result.errorType,
            });
            saveMetrics(metrics);
            process.exit(1);
            break;
            
          case ErrorTypes.RATE_LIMIT:
            metrics.rateLimitHits++;
            log('Rate limit hit - attempting model fallback', 'rate');

            // Broadcast to all peer harness processes
            {
              const rlResetAt = result.output ? (() => {
                const ms = calculateRateLimitWaitMs(result.output);
                return ms ? new Date(Date.now() + ms).toISOString() : null;
              })() : null;
              rateCoord.reportRateLimit(getCurrentModel(), { resetAt: rlResetAt, projectId: PROJECT_ID }).catch(() => {});
              log(`[RateCoord] Broadcast rate limit for model ${getCurrentModel()} to all peers`, 'rate');
            }
            
            // Try to switch to another model
            const nextModel = switchToNextModel();
            if (nextModel) {
              log(`Switched to fallback model: ${nextModel}`, 'info');
              // Retry immediately with new model (don't increment session number)
              consecutiveErrors = 0; // Reset since we're trying a new model
              continue; // Skip delay and retry with new model
            }
            // If no model available, will wait with backoff
            log('No fallback models available - will wait for rate limit reset', 'warning');
            break;
            
          default:
            // Continue with backoff
            break;
        }
        
        // Check consecutive error limit
        if (consecutiveErrors >= CONFIG.maxConsecutiveErrors) {
          log(`Max consecutive errors (${CONFIG.maxConsecutiveErrors}) reached - stopping`, 'error');
          updateStatus('error', 'max_errors', null, { 
            message: `Stopped after ${consecutiveErrors} consecutive errors`,
            lastError: result.errorType,
          });
          saveMetrics(metrics);
          process.exit(1);
        }
      }
      
      saveMetrics(metrics);

      // ── Budget Guardian check ──────────────────────────────────────
      if (budgetEnabled()) {
        const sessionTokens = result.metrics
          ? (result.metrics.inputTokens || 0) + (result.metrics.outputTokens || 0)
          : 0;
        const sessionCost = result.metrics?.cost || 0;
        const budgetResult = await checkBudgetGuardian(sessionTokens, sessionCost);
        if (budgetResult.paused) {
          if (budgetResult.hardStop) {
            updateStatus('SYSTEM', 'budget_limit', getProgressStats(), {
              message: 'Daily budget limit reached — harness stopped',
              checkpoint: '100%',
            });
            process.exit(0);
          }
          // Checkpoint pause — wait then resume
          updateStatus('SYSTEM', 'budget_pause', getProgressStats(), {
            message: `Budget ${Math.round(budgetResult.checkpoint * 100)}% checkpoint — cooling down`,
            resumeAt: new Date(Date.now() + budgetResult.pauseMs).toISOString(),
          });
          await new Promise(r => setTimeout(r, budgetResult.pauseMs));
          log('Budget guardian pause complete — resuming', 'info');
        }
      }

      // If not continuous mode, exit after one session
      if (!continuous) {
        log('Single session mode - exiting', 'end');
        break;
      }

      // Check completion after session (gated by the verification build/test)
      if (isProjectComplete()) {
        if (await confirmCompleteWithGate()) {
          log('All features implemented! Project complete.', 'success');
          break;
        }
        // Gate failed — keep iterating so the agent can fix the build/test.
      }

      // Calculate delay before next session
      let delay;
      if (result.success) {
        // Check for rate limit warnings in successful output (near limit)
        const hasWarning = result.output && (
          result.output.toLowerCase().includes('approaching') ||
          result.output.toLowerCase().includes('usage') ||
          result.output.toLowerCase().includes('quota')
        );
        
        // Progressive delay: start small after N sessions, build up to cap, then reset (sawtooth pattern)
        if (ADAPTIVE_DELAY && sessionNumber >= CONFIG.progressiveDelayAfterSessions) {
          // Initialize or reset progressive delay
          if (currentSessionDelay < CONFIG.progressiveDelayStart) {
            currentSessionDelay = CONFIG.progressiveDelayStart;
            delay = currentSessionDelay * 60 * 1000;
            log(`Progressive delay started at ${currentSessionDelay} minutes`, 'info');
          } else if (currentSessionDelay >= CONFIG.minAdaptiveDelayMinutes) {
            // Hit the cap - apply jittered cap delay, then reset for next cycle
            const jitteredDelay = CONFIG.minAdaptiveDelayMinutes + Math.random() * (CONFIG.maxAdaptiveDelayMinutes - CONFIG.minAdaptiveDelayMinutes);
            delay = jitteredDelay * 60 * 1000;
            // Reset to start for next session (sawtooth pattern)
            currentSessionDelay = 0; // Will be set to progressiveDelayStart next iteration
            log(`Progressive delay at cap (${jitteredDelay.toFixed(1)} min), resetting to ${CONFIG.progressiveDelayStart} min next session`, 'info');
          } else {
            // Increase delay progressively
            currentSessionDelay = Math.min(
              currentSessionDelay * CONFIG.adaptiveDelayMultiplier,
              CONFIG.maxAdaptiveDelayMinutes
            );
            // Apply small jitter to current delay
            const jitter = (Math.random() - 0.5) * 2 * CONFIG.jitterFactor * currentSessionDelay;
            const jitteredDelay = Math.max(currentSessionDelay + jitter, CONFIG.progressiveDelayStart);
            delay = jitteredDelay * 60 * 1000;
            log(`Progressive delay: ${jitteredDelay.toFixed(1)} minutes`, 'info');
          }
        } else {
          // First few sessions: minimal delay
          delay = CONFIG.minSessionGapMs;
        }
      } else {
        // On errors, increase adaptive delay
        if (ADAPTIVE_DELAY) {
          currentSessionDelay = Math.min(
            currentSessionDelay * CONFIG.adaptiveDelayMultiplier,
            CONFIG.maxAdaptiveDelayMinutes
          );
          log(`Adaptive delay increased to ${Math.min(currentSessionDelay, CONFIG.maxAdaptiveDelayMinutes).toFixed(1)} minutes due to error (capped 15-20 with jitter)`, 'warning');
        }
        
        delay = calculateBackoff(consecutiveErrors, result.errorType);

        if (result.errorType === ErrorTypes.RATE_LIMIT) {
          const rateWaitMs = calculateRateLimitWaitMs(result.output);
          if (rateWaitMs) {
            delay = rateWaitMs;
            // Also boost adaptive delay for next successful session
            currentSessionDelay = Math.min(
              currentSessionDelay * 2,
              CONFIG.maxAdaptiveDelayMinutes
            );
            updateStatus('SYSTEM', 'rate_limited', result.stats || getProgressStats(), {
              resumeAt: new Date(Date.now() + delay).toISOString(),
              waitMinutes: Math.round(delay / 1000 / 60),
            });
          }
        }
        
        if (delay === Infinity) {
          log('Unrecoverable error - stopping harness', 'error');
          break;
        }
      }
      
      const delaySeconds = (delay / 1000).toFixed(1);
      log(`Waiting ${delaySeconds}s before next session...`, 'pause');
      await new Promise(r => setTimeout(r, delay));
      
      sessionNumber++;
      
    } catch (error) {
      log(`Session failed: ${error.message}`, 'error');
      consecutiveErrors++;
      
      if (!continuous) {
        process.exit(1);
      }
      
      if (consecutiveErrors >= CONFIG.maxConsecutiveErrors) {
        log(`Max consecutive errors reached - stopping`, 'error');
        break;
      }
      
      const delay = calculateBackoff(consecutiveErrors, ErrorTypes.UNKNOWN);
      log(`Waiting ${(delay / 1000).toFixed(1)}s before retry...`, 'pause');
      await new Promise(r => setTimeout(r, delay));
      sessionNumber++;
    }
  }
  
  const finalStats = getProgressStats();
  log(`Harness finished. Final progress: ${finalStats.passing}/${finalStats.total} (${finalStats.percentComplete}%)`, 'end');
  log(`Sessions: ${metrics.successfulSessions}/${metrics.totalSessions} successful`, 'info');

  saveMetrics(metrics);

  // If the loop exited (e.g. maxSessions exhausted) with every feature marked
  // passing but the verification gate previously failed at this progress level,
  // the run is NOT genuinely complete — surface that with a non-zero exit so
  // callers/CI don't treat a red build/test as success.
  if (isProjectComplete() && lastGatedPassingCount === finalStats.passing) {
    log('Run ended with all features marked passing but the verification gate is red — exiting non-zero.', 'error');
    process.exitCode = 1;
  }
}

// ============================================
// CLI
// ============================================

const args = process.argv.slice(2);

function getArgValue(argv, name) {
  const eqPrefix = `${name}=`;
  const eq = argv.find(a => a.startsWith(eqPrefix));
  if (eq) return eq.slice(eqPrefix.length);

  const idx = argv.indexOf(name);
  if (idx !== -1 && idx + 1 < argv.length) {
    const candidate = argv[idx + 1];
    if (!candidate.startsWith('-')) return candidate;
  }

  return null;
}

const cliProjectRoot = getArgValue(args, '--path') || getArgValue(args, '--project-root') || process.env.PROJECT_ROOT;
// --project-id is accepted as an alias for --project. Unknown/unhandled flags
// previously fell through silently and the run capped at maxSessions=100 instead
// of running to completion, so accept the common aliases explicitly.
const cliProjectId = getArgValue(args, '--project') || getArgValue(args, '--project-id');
PROJECT_ID = cliProjectId || process.env.PROJECT_ID || path.basename(cliProjectRoot || PROJECT_ROOT);
if (cliProjectRoot) {
  PROJECT_ROOT = path.resolve(cliProjectRoot);
  CONFIG = createConfig(PROJECT_ROOT, PROJECT_ID);
}
PROJECT_ID = cliProjectId || process.env.PROJECT_ID || path.basename(PROJECT_ROOT);
PROMPT_OVERRIDE = getArgValue(args, '--prompt') || process.env.PROMPT_FILE || null;
INITIALIZER_PROMPT_OVERRIDE = getArgValue(args, '--initializer-prompt') || null;
FORCE_CODING = args.includes('--force-coding') || false;

// Feature list override from CLI (for repos with non-standard feature list paths)
const FEATURE_LIST_OVERRIDE = getArgValue(args, '--feature-list') || process.env.FEATURE_LIST || null;
if (FEATURE_LIST_OVERRIDE) {
  CONFIG.featureList = path.resolve(FEATURE_LIST_OVERRIDE);
}

// Model override from CLI (for complexity-based selection from run-queue.js)
const MODEL_OVERRIDE = getArgValue(args, '--model') || process.env.MODEL || null;
const FALLBACK_MODEL = getArgValue(args, '--fallback-model') || 'haiku';
const MAX_RETRIES_OVERRIDE = parseInt(getArgValue(args, '--max-retries') || '3', 10);

if (MODEL_OVERRIDE) {
  // Set as first model in available models and reset index
  currentModelIndex = AVAILABLE_MODELS.indexOf(MODEL_OVERRIDE);
  if (currentModelIndex === -1) {
    // Add custom model to available models
    AVAILABLE_MODELS.unshift(MODEL_OVERRIDE);
    currentModelIndex = 0;
  }
  
  // Ensure fallback model is in the list
  if (!AVAILABLE_MODELS.includes(FALLBACK_MODEL)) {
    AVAILABLE_MODELS.push(FALLBACK_MODEL);
  }
}

// Update max consecutive errors based on complexity
if (MAX_RETRIES_OVERRIDE) {
  CONFIG.maxConsecutiveErrors = MAX_RETRIES_OVERRIDE;
}

const durationHours = getArgValue(args, '--duration-hours') || process.env.DURATION_HOURS;
const durationMinutes = getArgValue(args, '--duration-minutes') || process.env.DURATION_MINUTES;
if (durationHours) {
  const h = parseFloat(durationHours);
  if (!Number.isNaN(h) && h > 0) DURATION_MS = Math.floor(h * 60 * 60 * 1000);
} else if (durationMinutes) {
  const m = parseFloat(durationMinutes);
  if (!Number.isNaN(m) && m > 0) DURATION_MS = Math.floor(m * 60 * 1000);
}

// Budget guardian CLI overrides
const cliBudgetTokens = getArgValue(args, '--daily-token-budget') || getArgValue(args, '--token-budget');
if (cliBudgetTokens) {
  const t = parseInt(cliBudgetTokens, 10);
  if (!Number.isNaN(t) && t > 0) DAILY_TOKEN_BUDGET = t;
}
const cliBudgetCost = getArgValue(args, '--daily-cost-budget') || getArgValue(args, '--cost-budget');
if (cliBudgetCost) {
  const c = parseFloat(cliBudgetCost);
  if (!Number.isNaN(c) && c > 0) DAILY_COST_BUDGET = c;
}
const cliBudgetPause = getArgValue(args, '--budget-pause-minutes');
if (cliBudgetPause) {
  const p = parseInt(cliBudgetPause, 10);
  if (!Number.isNaN(p) && p > 0) BUDGET_PAUSE_MINUTES = p;
}

// Claude app usage thresholds
const cliUsagePause = getArgValue(args, '--usage-pause-at');
if (cliUsagePause) {
  const p = parseInt(cliUsagePause, 10);
  if (!Number.isNaN(p) && p > 0 && p <= 100) USAGE_PAUSE_THRESHOLD = p;
}
const cliUsageStop = getArgValue(args, '--usage-stop-at');
if (cliUsageStop) {
  const s = parseInt(cliUsageStop, 10);
  if (!Number.isNaN(s) && s > 0 && s <= 100) USAGE_STOP_THRESHOLD = s;
}

const rateWaitMinutes = getArgValue(args, '--rate-limit-wait-minutes') || process.env.RATE_LIMIT_WAIT_MINUTES;
if (rateWaitMinutes) {
  const m = parseInt(rateWaitMinutes, 10);
  if (!Number.isNaN(m) && m >= 0) RATE_LIMIT_WAIT_MINUTES = m;
}

const sessionDelayMinutes = getArgValue(args, '--session-delay') || getArgValue(args, '--delay') || process.env.SESSION_DELAY_MINUTES;
if (sessionDelayMinutes) {
  const m = parseFloat(sessionDelayMinutes);
  if (!Number.isNaN(m) && m >= 0) SESSION_DELAY_MINUTES = m;
}

// Duration presets (hours)
const durationPreset = getArgValue(args, '--hours');
if (durationPreset) {
  const h = parseFloat(durationPreset);
  if (!Number.isNaN(h) && h > 0) DURATION_MS = Math.floor(h * 60 * 60 * 1000);
}

// Until complete mode (--run-until-complete is an accepted alias)
UNTIL_COMPLETE = args.includes('--until-complete') ||
  args.includes('--complete') ||
  args.includes('--run-until-complete') ||
  process.env.UNTIL_COMPLETE === 'true';

// Adaptive delay toggle
if (args.includes('--no-adaptive')) {
  ADAPTIVE_DELAY = false;
}

const options = {
  continuous: DEFAULT_CONTINUOUS || args.includes('--continuous') || args.includes('-c'),
  maxSessions: UNTIL_COMPLETE
    ? 999999
    : (parseInt(
        getArgValue(args, '--max-sessions') ||
        getArgValue(args, '--maxSessions') ||
        getArgValue(args, '--max')
      ) || CONFIG.maxSessions)
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Agent Harness Runner v2
=======================

Enhanced harness with intelligent error handling and rate limiting.

Usage: node run-harness-v2.js [options]

Options:
  --continuous, -c    Run continuously until all features are complete
  --max=N             Maximum number of sessions to run (default: 100)
  --max-sessions N     Maximum number of sessions to run (alias for --max)
  --path PATH          Project path to run the harness against (defaults to dashboard root)
  --project ID         Project id/name to include in status artifacts
  --project-id ID      Alias for --project
  --prompt FILE        Override coding prompt file
  --initializer-prompt FILE  Override initializer prompt file
  --force-coding       Skip initializer detection and always use the coding prompt
  --hours N            Duration preset in hours (e.g., --hours=8, --hours=16, --hours=24)
  --until-complete     Run until all features pass (no time limit)
  --complete           Alias for --until-complete
  --run-until-complete Alias for --until-complete
  --no-adaptive        Disable adaptive delay adjustment
  --duration-hours N   Stop after N hours (optional)
  --duration-minutes N Stop after N minutes (optional)
  --rate-limit-wait-minutes N  If output includes 'resets Xpm', wait N minutes after reset (default: 20)
  --session-delay N    Minutes to wait between successful sessions (default: 0)
  --delay N            Alias for --session-delay
  --daily-token-budget N     Daily token limit (pauses at 25/50/75%, stops at 100%)
  --daily-cost-budget N      Daily cost limit in USD (same checkpoints)
  --budget-pause-minutes N   Minutes to pause at each checkpoint (default: 30)
  --usage-pause-at N         Pause when Claude app weekly usage hits N% (default: 75)
  --usage-stop-at N          Stop when Claude app weekly usage hits N% (default: 90)
  --help, -h          Show this help message

Features:
  • Exponential backoff with jitter for failures
  • Auth error detection (stops immediately, doesn't waste retries)
  • Rate limit handling with extended pauses
  • Session metrics tracking
  • Consecutive error limit protection

Examples:
  node run-harness-v2.js                  # Run single session
  node run-harness-v2.js -c               # Run continuously
  node run-harness-v2.js -c --max=50      # Run up to 50 sessions
  node run-harness-v2.js -c --delay=5     # Run continuously with 5 min delay between sessions
  node run-harness-v2.js --hours=8         # Run for 8 hours (default continuous + 5 min delay)
  node run-harness-v2.js --hours=24        # Run for 24 hours overnight
  node run-harness-v2.js --until-complete  # Run until all features pass
  node run-harness-v2.js -c --daily-token-budget=5000000  # 5M token daily cap
  node run-harness-v2.js -c --daily-cost-budget=10        # $10/day cap
  node run-harness-v2.js -c --daily-cost-budget=5 --budget-pause-minutes=60  # $5/day, 1hr pauses
`);
  process.exit(0);
}

// ============================================================
// Main-module guard — only run the harness when executed directly
// (e.g. `node run-harness-v2.js`), NOT when imported by another module.
// Importing this file must have no startup side effects.
// ============================================================
const IS_MAIN_MODULE = import.meta.url === `file://${process.argv[1]}`;

if (IS_MAIN_MODULE) {
  // Check for Claude CLI
  try {
    execSync('which claude', { stdio: 'ignore' });
  } catch (e) {
    log('Claude CLI not found. Please install Claude Code first.', 'error');
    log('Visit: https://docs.anthropic.com/en/docs/agents-and-tools/claude-code', 'info');
    process.exit(1);
  }

  // ============================================================
  // STRICT AUTH ENFORCEMENT: Claude OAuth only — never API key
  // ============================================================
  if (process.env.ANTHROPIC_API_KEY) {
    log('', 'error');
    log('╔══════════════════════════════════════════════════════════╗', 'error');
    log('║  FATAL: ANTHROPIC_API_KEY is set in environment          ║', 'error');
    log('║  ACD must NEVER use Claude API key auth.                 ║', 'error');
    log('║  This would incur direct API costs.                      ║', 'error');
    log('║                                                          ║', 'error');
    log('║  Fix: unset ANTHROPIC_API_KEY                            ║', 'error');
    log('║  Auth: CLAUDE_CODE_OAUTH_TOKEN (Claude subscription)     ║', 'error');
    log('╚══════════════════════════════════════════════════════════╝', 'error');
    log('', 'error');
    process.exit(2);
  }

  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    // No token in env — Claude Code may have auth stored locally, allow it but warn
    log('Note: CLAUDE_CODE_OAUTH_TOKEN not in env — using Claude Code stored auth.', 'info');
    log('If auth fails, run: claude auth login', 'info');
  } else {
    log('Auth: Claude OAuth token confirmed — API key mode disabled.', 'info');
  }

  runHarness(options).catch(e => {
    log(`Fatal error: ${e.message}`, 'error');
    process.exit(1);
  });
}
