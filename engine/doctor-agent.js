#!/usr/bin/env node

/**
 * ACD Doctor Agent
 * ================
 * Spawned by the watchdog when the queue stalls or stales.
 * Uses the Claude Agents SDK (claude CLI, OAuth) to diagnose and self-heal.
 *
 * Healing capabilities:
 *   - Fix malformed feature list JSON (bare array → {features:[...]})
 *   - Clear corrupted harness-status.json
 *   - Kill zombie claude/harness processes
 *   - Identify repeating error patterns in logs
 *   - Report root cause + actions taken
 *
 * Usage (standalone):
 *   node doctor-agent.js --reason "Heartbeat stale" --repo cloud-sync-mcp
 *
 * Programmatic:
 *   import { runDoctorAgent } from './doctor-agent.js';
 *   const result = await runDoctorAgent({ reason, currentRepo });
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────────────────
const DIAGNOSIS_FILE    = path.join(__dirname, 'doctor-diagnosis.json');
const DOCTOR_LOG_FILE   = path.join(__dirname, 'logs', 'doctor-agent.log');
const QUEUE_LOG_FILE    = path.join(__dirname, 'logs', 'watchdog-queue.log');
const HEARTBEAT_FILE    = path.join(__dirname, 'watchdog-heartbeat.json');
const QUEUE_STATUS_FILE = path.join(__dirname, 'queue-status.json');
const DOCTOR_TIMEOUT_MS = 5 * 60 * 1000; // 5 min max
const LOG_TAIL_LINES    = 80;

function log(msg) {
  const line = `${new Date().toISOString()} [doctor] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(DOCTOR_LOG_FILE, line + '\n'); } catch { /* non-fatal */ }
}

// ── Context builder ──────────────────────────────────────────────────────────
function buildContext(options = {}) {
  const { reason = 'unknown', currentRepo = null } = options;
  const ctx = { reason, currentRepo, ts: new Date().toISOString() };

  // Log tail
  if (fs.existsSync(QUEUE_LOG_FILE)) {
    try {
      const all = fs.readFileSync(QUEUE_LOG_FILE, 'utf-8').split('\n');
      ctx.logTail = all.slice(-LOG_TAIL_LINES).join('\n');
    } catch { ctx.logTail = '(unreadable)'; }
  }

  // Heartbeat
  if (fs.existsSync(HEARTBEAT_FILE)) {
    try { ctx.heartbeat = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8')); } catch { /* ok */ }
  }

  // Queue status
  if (fs.existsSync(QUEUE_STATUS_FILE)) {
    try { ctx.queueStatus = JSON.parse(fs.readFileSync(QUEUE_STATUS_FILE, 'utf-8')); } catch { /* ok */ }
  }

  // Active repo details
  const repoId = currentRepo || ctx.heartbeat?.currentRepo;
  if (repoId) {
    // Try to find feature list
    const harnessFeaturesPath = path.join(__dirname, `${repoId}-features.json`);
    const featuresDirPath     = path.join(__dirname, 'features', `${repoId}.json`);
    for (const fp of [harnessFeaturesPath, featuresDirPath]) {
      if (fs.existsSync(fp)) {
        try {
          ctx.featureListPath = fp;
          ctx.featureListRaw  = fs.readFileSync(fp, 'utf-8');
        } catch { /* ok */ }
        break;
      }
    }

    // Try to find harness-status.json in repo dir
    try {
      const repoQueue = JSON.parse(fs.readFileSync(path.join(__dirname, 'repo-queue.json'), 'utf-8'));
      const repoEntry = repoQueue.repos?.find(r => r.id === repoId);
      if (repoEntry?.path) {
        ctx.repoPath = repoEntry.path;
        const harnessStatus = path.join(repoEntry.path, 'harness-status.json');
        if (fs.existsSync(harnessStatus)) {
          ctx.harnessStatusPath = harnessStatus;
          ctx.harnessStatus = fs.readFileSync(harnessStatus, 'utf-8');
        }
      }
    } catch { /* ok */ }
  }

  return ctx;
}

// ── Doctor prompt ────────────────────────────────────────────────────────────
function buildDoctorPrompt(ctx) {
  return `You are the ACD Doctor Agent — a Claude Code agent that self-heals the Autonomous Coding Dashboard queue.

## Situation
The ACD watchdog detected a problem and has called you in to diagnose and fix it.

**Stall reason:** ${ctx.reason}
**Active repo:** ${ctx.currentRepo || ctx.heartbeat?.currentRepo || 'unknown'}
**Timestamp:** ${ctx.ts}

## Queue state
${ctx.queueStatus ? JSON.stringify(ctx.queueStatus, null, 2) : '(unavailable)'}

## Recent queue log (last ${LOG_TAIL_LINES} lines)
\`\`\`
${ctx.logTail || '(no log available)'}
\`\`\`

${ctx.featureListPath ? `## Active feature list\nPath: \`${ctx.featureListPath}\`\n\`\`\`json\n${ctx.featureListRaw}\n\`\`\`` : ''}

${ctx.harnessStatusPath ? `## Harness status\nPath: \`${ctx.harnessStatusPath}\`\n\`\`\`json\n${ctx.harnessStatus}\n\`\`\`` : ''}

## Your job
1. **Diagnose** why the queue stalled — read the log, check files
2. **Fix** any fixable issues:
   - If feature list is a bare JSON array (not \`{"features":[...]}\`) → wrap it and write it back
   - If harness-status.json shows a non-fatal error state → you may delete it so the harness starts fresh
   - If zombie claude/node processes are running → kill them with Bash
   - If there's a clear config issue → fix it
3. **Write diagnosis** to: \`${DIAGNOSIS_FILE}\`

## Diagnosis format (write this JSON file exactly)
\`\`\`json
{
  "ts": "${ctx.ts}",
  "repo": "${ctx.currentRepo || ctx.heartbeat?.currentRepo || 'unknown'}",
  "stallReason": "${ctx.reason}",
  "rootCause": "your diagnosis here",
  "healed": true,
  "actions": ["action 1", "action 2"],
  "restartRecommended": false,
  "notes": "any other notes"
}
\`\`\`

Set \`"healed": true\` if you fixed the root cause, \`false\` if you couldn't.
Set \`"restartRecommended": true\` if the queue needs a fresh restart after your fixes.

## Rules
- Keep this session SHORT — max 10 turns
- Do NOT start implementing features — diagnosis and fixes only
- Write the diagnosis file as your LAST action before finishing
- If you cannot identify the problem, still write the diagnosis file with \`"healed": false\`
`;
}

// ── Run doctor via claude CLI ────────────────────────────────────────────────
export async function runDoctorAgent(options = {}) {
  log(`Starting doctor session — reason: "${options.reason || 'unknown'}"`);

  const ctx = buildContext(options);
  const prompt = buildDoctorPrompt(ctx);

  // Clear previous diagnosis
  try { fs.unlinkSync(DIAGNOSIS_FILE); } catch { /* ok */ }

  // Write prompt to temp file to avoid shell escaping issues
  const promptFile = path.join(__dirname, 'logs', 'doctor-prompt.tmp');
  fs.writeFileSync(promptFile, prompt);

  const claudeArgs = [
    '-p', prompt,
    '--model', 'claude-sonnet-4-5-20250929',
    '--allowedTools', 'Read', 'Edit', 'Write', 'Bash',
    '--max-turns', '12',
    '--output-format', 'stream-json',
  ];

  // Build env: force OAuth, never API key; strip CLAUDECODE so nested claude CLI can spawn
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDECODE;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      log('Doctor session timed out after 5 min');
      claude.kill('SIGTERM');
      resolve({ healed: false, reason: 'timeout', actions: [], restartRecommended: true });
    }, DOCTOR_TIMEOUT_MS);

    let output = '';

    const claude = spawn('claude', claudeArgs, {
      cwd: options.repoPath || __dirname,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    claude.stdout.on('data', d => {
      const text = d.toString();
      output += text;
      try { fs.appendFileSync(DOCTOR_LOG_FILE, text); } catch { /* ok */ }
    });
    claude.stderr.on('data', d => {
      const text = d.toString();
      output += text;
      try { fs.appendFileSync(DOCTOR_LOG_FILE, text); } catch { /* ok */ }
    });

    claude.on('error', err => {
      clearTimeout(timeoutId);
      log(`Doctor claude spawn error: ${err.message}`);
      resolve({ healed: false, reason: `spawn error: ${err.message}`, actions: [], restartRecommended: true });
    });

    claude.on('close', code => {
      clearTimeout(timeoutId);
      log(`Doctor session exited (code ${code})`);

      // Clean up temp prompt file
      try { fs.unlinkSync(promptFile); } catch { /* ok */ }

      // Read diagnosis
      if (fs.existsSync(DIAGNOSIS_FILE)) {
        try {
          const diagnosis = JSON.parse(fs.readFileSync(DIAGNOSIS_FILE, 'utf-8'));
          log(`Diagnosis: healed=${diagnosis.healed}, root="${diagnosis.rootCause}"`);
          if (diagnosis.actions?.length) {
            diagnosis.actions.forEach(a => log(`  Action: ${a}`));
          }
          resolve(diagnosis);
          return;
        } catch (e) {
          log(`Failed to parse diagnosis file: ${e.message}`);
        }
      }

      // Fallback if doctor didn't write diagnosis
      resolve({
        healed: false,
        reason: `Doctor exited (code ${code}) without writing diagnosis`,
        actions: [],
        restartRecommended: true,
      });
    });
  });
}

// ── Standalone CLI ───────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const cliArgs = process.argv.slice(2);
  const getArg = (name) => {
    const eq = cliArgs.find(a => a.startsWith(`${name}=`));
    if (eq) return eq.split('=').slice(1).join('=');
    const idx = cliArgs.indexOf(name);
    return (idx !== -1 && idx + 1 < cliArgs.length) ? cliArgs[idx + 1] : null;
  };

  const reason      = getArg('--reason')  || 'Manual invocation';
  const currentRepo = getArg('--repo')    || null;

  log('ACD Doctor Agent — standalone mode');
  runDoctorAgent({ reason, currentRepo })
    .then(result => {
      console.log('\n── Doctor Result ──');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.healed ? 0 : 1);
    })
    .catch(e => {
      console.error(`Fatal: ${e.message}`);
      process.exit(1);
    });
}
