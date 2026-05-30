#!/usr/bin/env node
/**
 * run-harness-project.js
 * Runs the ACD harness against an external project (not the ACD dashboard itself).
 *
 * Usage:
 *   node harness/run-harness-project.js \
 *     --slug safari-decoupled-push-arch \
 *     --path "/Users/isaiahdupree/Documents/Software/Safari Automation" \
 *     --features harness/safari-decoupled-push-arch-features.json \
 *     --prompt harness/prompts/safari-decoupled-push-arch.md \
 *     [--continuous]
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ACD_ROOT, PROMPTS_DIR, LOGS_DIR } from './paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Parse args ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function getArg(flag) {
  const i = argv.findIndex(a => a === flag);
  return i >= 0 ? argv[i + 1] : null;
}
const slug        = getArg('--slug') || 'unknown';
const projectPath = getArg('--path') || ACD_ROOT;
const featuresArg = getArg('--features');
const promptArg   = getArg('--prompt');
const continuous  = argv.includes('--continuous');
const maxSessions = parseInt(getArg('--max') || '50');

const featuresFile = featuresArg
  ? path.resolve(ACD_ROOT, featuresArg)
  : path.join(projectPath, 'feature_list.json');

const promptFile = promptArg
  ? path.resolve(ACD_ROOT, promptArg)
  : path.join(PROMPTS_DIR, 'coding.md');

const logFile = path.join(LOGS_DIR, `${slug}.log`);
const statusFile = path.join(ACD_ROOT, `harness-status-${slug}.json`);

fs.mkdirSync(LOGS_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

function getStats() {
  if (!fs.existsSync(featuresFile)) return { passing: 0, total: 0, pct: '0%' };
  const data = JSON.parse(fs.readFileSync(featuresFile, 'utf-8'));
  const features = data.features || (Array.isArray(data) ? data : []);
  const passing = features.filter(f => f.passes).length;
  return { passing, total: features.length, pct: `${Math.round(passing / (features.length || 1) * 100)}%` };
}

function allDone() {
  const s = getStats();
  return s.total > 0 && s.passing >= s.total;
}

// Max unpassed features to inline into the prompt per session. Inlining the
// ENTIRE feature list (often 50-70+ features) bloats the prompt and dilutes the
// agent's focus, so we hand it only the next actionable batch.
const FEATURE_BATCH_SIZE = parseInt(process.env.ACD_FEATURE_BATCH_SIZE || '25', 10);

/**
 * Pick the next batch of up to FEATURE_BATCH_SIZE unpassed features, in file
 * order, honoring any `dependencies` field (an array of feature ids). A feature
 * is only included once all of its dependencies are either already passing or
 * already included earlier in the same batch. Features with unmet deps are
 * skipped (a later session picks them up once their deps pass).
 * Returns { batch, totalPending }.
 */
function selectNextBatch(features) {
  const passedIds = new Set(features.filter(f => f.passes).map(f => f.id));
  const pending = features.filter(f => !f.passes);
  const selectedIds = new Set();
  const batch = [];

  for (const f of pending) {
    if (batch.length >= FEATURE_BATCH_SIZE) break;
    const deps = Array.isArray(f.dependencies) ? f.dependencies : [];
    const depsMet = deps.every(d => passedIds.has(d) || selectedIds.has(d));
    if (!depsMet) continue; // its dependencies aren't ready yet
    batch.push(f);
    if (f.id != null) selectedIds.add(f.id);
  }

  // Safety net: if dependency gating filtered everything out (e.g. circular or
  // dangling deps), fall back to plain file order so the run never stalls.
  if (batch.length === 0 && pending.length > 0) {
    return { batch: pending.slice(0, FEATURE_BATCH_SIZE), totalPending: pending.length };
  }
  return { batch, totalPending: pending.length };
}

function updateStatus(phase, state) {
  const s = getStats();
  fs.writeFileSync(statusFile, JSON.stringify({
    slug, phase, state, projectPath, featuresFile,
    progress: s, updatedAt: new Date().toISOString()
  }, null, 2));
}

// ─── Session runner ───────────────────────────────────────────────────────────
function runSession(sessionNum) {
  return new Promise((resolve, reject) => {
    const s = getStats();
    log(`Session #${sessionNum} | ${s.passing}/${s.total} (${s.pct})`);
    updateStatus('coding', 'running');

    let prompt = fs.readFileSync(promptFile, 'utf-8');
    // Strip YAML frontmatter (--- ... ---) to avoid CLI flag parsing issues
    prompt = prompt.replace(/^---[\s\S]*?---\n*/, '');

    // Inline only the next actionable batch of unpassed features (dependency-aware)
    // instead of the entire file — keeps the prompt focused and within context.
    const featuresData = JSON.parse(fs.readFileSync(featuresFile, 'utf-8'));
    const allFeatures = featuresData.features || (Array.isArray(featuresData) ? featuresData : []);
    const { batch, totalPending } = selectNextBatch(allFeatures);
    const batchJson = JSON.stringify(batch, null, 2);
    log(`Inlining ${batch.length} of ${totalPending} pending features (batch size ${FEATURE_BATCH_SIZE})`);

    const fullPrompt = `${prompt}

## Next Features To Implement (${batch.length} of ${totalPending} pending)
The full feature list lives at: ${featuresFile}
Below are the next features to work on (dependency-ordered). Implement them in order:
\`\`\`json
${batchJson}
\`\`\`

For EACH feature: implement it, verify it works, then read ${featuresFile}, set "passes": true on the matching feature by "id", and write the file back. Commit after each feature. There are ${totalPending} pending features total — this session covers the next ${batch.length}; later sessions handle the rest.`;

    const args = [
      '-p', fullPrompt,
      '--allowedTools', 'Edit', 'Bash', 'Read', 'Write', 'Glob', 'Grep',
      'mcp__supabase__apply_migration', 'mcp__supabase__execute_sql',
      '--output-format', 'stream-json',
      '--verbose',
    ];

    const env = { ...process.env };
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    delete env.ANTHROPIC_API_KEY;
    delete env.CLAUDECODE; // allow nested Claude Code sessions

    const claude = spawn('claude', args, {
      cwd: projectPath,
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let out = '';
    claude.stdout.on('data', d => { out += d; process.stdout.write(d); });
    claude.stderr.on('data', d => process.stderr.write(d));
    claude.on('error', err => { log(`ERROR: ${err.message}`); updateStatus('coding', 'error'); reject(err); });
    claude.on('close', code => {
      const after = getStats();
      const gained = after.passing - s.passing;
      log(`Session #${sessionNum} done (exit ${code}) | +${gained} features | ${after.passing}/${after.total}`);
      updateStatus('coding', code === 0 ? 'idle' : 'error');
      resolve({ code, gained });
    });
  });
}

// ─── Main loop ────────────────────────────────────────────────────────────────
async function main() {
  log(`Starting harness for: ${slug}`);
  log(`  Project: ${projectPath}`);
  log(`  Features: ${featuresFile}`);
  log(`  Prompt: ${promptFile}`);

  if (!fs.existsSync(featuresFile)) {
    log(`ERROR: Features file not found: ${featuresFile}`);
    process.exit(1);
  }
  if (!fs.existsSync(promptFile)) {
    log(`ERROR: Prompt file not found: ${promptFile}`);
    process.exit(1);
  }

  let session = 1;
  do {
    if (allDone()) { log('All features passing — done!'); break; }
    if (session > maxSessions) { log(`Max sessions (${maxSessions}) reached`); break; }
    await runSession(session++);
    if (!allDone()) await new Promise(r => setTimeout(r, 5000));
  } while (continuous || session <= 1);

  const s = getStats();
  log(`Final: ${s.passing}/${s.total} features passing`);
}

// Main-module guard: only run when executed directly, not when imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
