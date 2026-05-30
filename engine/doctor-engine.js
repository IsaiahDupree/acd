#!/usr/bin/env node

/**
 * ACD Doctor Engine
 * =================
 * Uses @anthropic-ai/sdk with a tool-use loop to diagnose and heal stuck agents.
 * "Claude diagnoses Claude" — reads logs, status, telemetry, then executes fixes.
 *
 * Usage:
 *   import { diagnoseAndHeal } from './doctor-engine.js';
 *   const result = await diagnoseAndHeal('my-slug', 'No status update for 35 minutes');
 *   // result: { diagnosis, actions_taken, success, turns }
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getEvents } from './agent-telemetry.js';
import { ENGINE_DIR, ACD_ROOT, LOGS_DIR, QUEUE_FILE, featureFile } from './paths.js';

const DASHBOARD_ROOT = ACD_ROOT;
const PROGRESS_FILE = path.join(DASHBOARD_ROOT, 'claude-progress.txt');

// ── Tool definitions ──────────────────────────────────────────────────────────

const DOCTOR_TOOLS = [
  {
    name: 'get_agent_status',
    description: 'Read the harness-status-{slug}.json file from the dashboard root',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Agent slug / project ID' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'read_agent_logs',
    description: 'Read the last N lines from the agent log file in data/logs/',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        lines: { type: 'number', description: 'Number of tail lines (default 150)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'read_feature_list',
    description: 'Read the features JSON for the agent, showing pass/fail state',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'read_telemetry',
    description: 'Read last N telemetry events from in-memory ring buffer',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        limit: { type: 'number', description: 'Number of events (default 20)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'kill_agent',
    description: 'Send SIGTERM to the agent process by PID (reads PID from status if not provided)',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        pid: { type: 'number', description: 'PID to kill (optional — reads from status file)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'restart_agent',
    description: 'Re-run engine/launch.sh <slug> to restart the agent in the background',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'fix_feature_file',
    description: 'Write corrected features JSON to the feature list file',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        content: { type: 'string', description: 'Full JSON string to write to the feature file' },
      },
      required: ['slug', 'content'],
    },
  },
  {
    name: 'inject_note',
    description: 'Append a diagnosis note to claude-progress.txt',
    input_schema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Diagnosis note to append' },
      },
      required: ['note'],
    },
  },
  {
    name: 'read_repo_config',
    description: 'Read the repo-queue.json entry for a repo ID — returns its featureList path, PRD path, priority, and enabled status',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Repo ID as it appears in repo-queue.json' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'run_harness_session',
    description: 'Trigger a single run-harness-v2.js CODING session for a queue repo. Use this to give a stuck repo a fresh attempt after diagnosing the root cause.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Repo ID from repo-queue.json' },
        max_sessions: { type: 'number', description: 'Max sessions to run (default 1)' },
      },
      required: ['slug'],
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

function handleTool(name, input) {
  switch (name) {
    case 'get_agent_status': {
      const statusFile = path.join(DASHBOARD_ROOT, `harness-status-${input.slug}.json`);
      if (!fs.existsSync(statusFile)) return { error: 'Status file not found', tried: statusFile };
      try {
        return JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'read_agent_logs': {
      const lines = input.lines || 150;
      const logFile = path.join(LOGS_DIR, `${input.slug}.log`); // LOGS_DIR from paths.js (data/logs)
      if (!fs.existsSync(logFile)) return { error: 'Log file not found', tried: logFile };
      try {
        const all = fs.readFileSync(logFile, 'utf-8').split('\n');
        return { content: all.slice(-lines).join('\n'), totalLines: all.length };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'read_feature_list': {
      // First check repo-queue.json for the correct path
      let repoFeatureList = null;
      try {
        const q = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
        const repo = q.repos.find(r => r.id === input.slug);
        if (repo?.featureList) repoFeatureList = repo.featureList;
      } catch { /* ok */ }
      const candidates = [
        repoFeatureList,
        featureFile(input.slug),
        path.join(ENGINE_DIR, `${input.slug}-features.json`), // legacy fallback
      ].filter(Boolean);
      for (const fp of candidates) {
        if (fs.existsSync(fp)) {
          try {
            return { ...JSON.parse(fs.readFileSync(fp, 'utf-8')), _path: fp };
          } catch (e) {
            return { error: e.message };
          }
        }
      }
      return { error: 'Feature file not found', tried: candidates };
    }

    case 'read_telemetry': {
      return { events: getEvents(input.slug, input.limit || 20) };
    }

    case 'kill_agent': {
      let pid = input.pid;
      if (!pid) {
        const statusFile = path.join(DASHBOARD_ROOT, `harness-status-${input.slug}.json`);
        try {
          pid = JSON.parse(fs.readFileSync(statusFile, 'utf-8')).pid;
        } catch { /* ok */ }
      }
      if (!pid) return { error: 'No PID found — cannot kill' };
      try {
        process.kill(pid, 'SIGTERM');
        return { killed: true, pid };
      } catch (e) {
        return { error: e.message, pid };
      }
    }

    case 'restart_agent': {
      // The package replaced 152 per-slug scripts with a single launch.sh <slug>.
      const launchScript = path.join(ENGINE_DIR, 'launch.sh');
      if (!fs.existsSync(launchScript)) {
        return { error: `Launch script not found: ${launchScript}` };
      }
      try {
        const proc = spawn('/bin/zsh', [launchScript, input.slug], {
          detached: true,
          stdio: 'ignore',
          cwd: ENGINE_DIR,
        });
        proc.unref();
        return { started: true, pid: proc.pid, script: launchScript, slug: input.slug };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'fix_feature_file': {
      const candidates = [
        featureFile(input.slug),
        path.join(ENGINE_DIR, `${input.slug}-features.json`), // legacy fallback
      ];
      const fp = candidates.find(f => fs.existsSync(f)) || candidates[0];
      try {
        JSON.parse(input.content); // validate JSON before writing
        fs.writeFileSync(fp, input.content);
        return { written: true, path: fp };
      } catch (e) {
        return { error: `Invalid JSON or write error: ${e.message}` };
      }
    }

    case 'inject_note': {
      try {
        const line = `\n[DOCTOR ${new Date().toISOString()}] ${input.note}\n`;
        fs.appendFileSync(PROGRESS_FILE, line);
        return { written: true };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'read_repo_config': {
      const qPath = QUEUE_FILE;
      try {
        const q = JSON.parse(fs.readFileSync(qPath, 'utf-8'));
        const repo = q.repos.find(r => r.id === input.slug);
        if (!repo) return { error: `Repo not found: ${input.slug}` };
        // Also read current feature progress
        let featureProgress = null;
        if (repo.featureList && fs.existsSync(repo.featureList)) {
          const f = JSON.parse(fs.readFileSync(repo.featureList, 'utf-8'));
          const feats = f.features || [];
          featureProgress = { passing: feats.filter(x => x.passes).length, total: feats.length, pending: feats.filter(x => !x.passes).map(x => x.id) };
        }
        return { ...repo, featureProgress };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'run_harness_session': {
      const qPath = QUEUE_FILE;
      try {
        const q = JSON.parse(fs.readFileSync(qPath, 'utf-8'));
        const repo = q.repos.find(r => r.id === input.slug);
        if (!repo) return { error: `Repo not found: ${input.slug}` };
        const harnessArgs = [
          path.join(ENGINE_DIR, 'run-harness-v2.js'),
          `--path=${repo.path || DASHBOARD_ROOT}`,
          `--project=${repo.id}`,
          '--force-coding',
          '--model=claude-sonnet-4-5-20250929',
          `--max=${input.max_sessions || 1}`,
        ];
        if (repo.featureList) harnessArgs.push(`--feature-list=${repo.featureList}`);
        if (repo.prompt) {
          const promptPath = repo.prompt.startsWith('/') ? repo.prompt : path.join(ENGINE_DIR, repo.prompt);
          if (fs.existsSync(promptPath)) harnessArgs.push(`--prompt=${promptPath}`);
        }
        const env = { ...process.env };
        delete env.CLAUDECODE;
        const logFile = path.join(LOGS_DIR, `doctor-run-${input.slug}.log`);
        const proc = spawn('node', harnessArgs, {
          cwd: DASHBOARD_ROOT,
          stdio: ['ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile, 'a')],
          detached: true,
          env,
        });
        proc.unref();
        return { started: true, pid: proc.pid, log: logFile, args: harnessArgs };
      } catch (e) {
        return { error: e.message };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Doctor system prompt ──────────────────────────────────────────────────────

const DOCTOR_SYSTEM = `You are the ACD Doctor Agent — a diagnostics system that identifies and fixes stuck autonomous coding agents.

Your job:
1. Call read_repo_config first (for queue repos) or get_agent_status (for daemon agents) to understand the repo
2. Read the feature list and/or logs to identify the root cause of zero progress
3. Execute 1-3 targeted healing actions
4. Append a concise diagnosis note via inject_note as your LAST action

Root causes to look for:
- Feature JSON has correct structure but all passes:false — agent isn't marking features done
- Feature JSON is corrupt (bare array instead of {"features": [...]}) — use fix_feature_file
- Feature JSON path mismatch — agent can't find/write the file
- PRD prompt not giving agent clear enough task context
- Agent sessions completing with 0 tool calls (just saying "ready to help")
- Zombie process (PID alive but no log output for 15+ minutes)
- Rate limit or auth error causing sessions to fail immediately

For stuck queue repos (zero progress across passes):
1. Call read_repo_config to get featureList path, PRD path, current progress
2. Read the feature list to see what's pending
3. If the feature JSON structure looks correct and features are trivial stubs, try fixing 1-2 directly via fix_feature_file (mark them passes:true if they're truly complete)
4. Then call run_harness_session to give it a fresh attempt with the fix in place
5. Use inject_note to document what you found and what you did

Rules:
- Keep sessions ≤ 12 tool calls total
- For queue repos: prefer run_harness_session over restart_agent (restart_agent is for daemons with launch scripts)
- Always call inject_note as your final action to document the diagnosis
- If you cannot fix the issue, still inject_note explaining what you found`;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Diagnose and heal a stuck agent using a Claude tool-use loop.
 * @param {string} slug - Agent project ID
 * @param {string} reason - Why the agent was flagged as stuck
 * @returns {Promise<{diagnosis: string, actions_taken: Array, success: boolean, turns: number}>}
 */
export async function diagnoseAndHeal(slug, reason) {
  // Prefer OAuth token; fall back to API key only if explicitly provided
  const authOpts = process.env.CLAUDE_CODE_OAUTH_TOKEN
    ? { authToken: process.env.CLAUDE_CODE_OAUTH_TOKEN, baseURL: 'https://api.claude.ai/api' }
    : { apiKey: process.env.ANTHROPIC_API_KEY };
  const client = new Anthropic(authOpts);

  const messages = [
    {
      role: 'user',
      content: `Agent "${slug}" appears stuck.\nReason: ${reason}\n\nPlease diagnose and heal it. Start by reading the agent's status and recent logs.`,
    },
  ];

  const actionsTaken = [];
  let diagnosis = null;
  let turns = 0;
  const MAX_TURNS = 10;

  while (turns < MAX_TURNS) {
    turns++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: DOCTOR_SYSTEM,
      tools: DOCTOR_TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      if (textBlock) diagnosis = textBlock.text;
      break;
    }

    if (response.stop_reason !== 'tool_use') break;

    // Execute tool calls and collect results
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = handleTool(block.name, block.input);
      actionsTaken.push({ tool: block.name, input: block.input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  const success =
    actionsTaken.some(a => a.tool === 'restart_agent' && a.result?.started === true) ||
    actionsTaken.some(a => a.tool === 'fix_feature_file' && a.result?.written === true);

  return { diagnosis, actions_taken: actionsTaken, success, turns };
}

// ── CLI usage ─────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const eq = args.find(a => a.startsWith(`${flag}=`));
    if (eq) return eq.split('=').slice(1).join('=');
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  const slug = getArg('--slug') || args[0];
  const reason = getArg('--reason') || 'Manual invocation';

  if (!slug) {
    console.error('Usage: node doctor-engine.js --slug <slug> [--reason <reason>]');
    process.exit(1);
  }

  console.log(`Doctor engine running for "${slug}"...`);
  diagnoseAndHeal(slug, reason)
    .then(result => {
      console.log('\n── Doctor Result ──');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(e => {
      console.error(`Fatal: ${e.message}`);
      process.exit(1);
    });
}
