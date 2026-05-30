// engine/verify-gate.js
// =====================
// Best-effort verification gate for ACD target repos.
//
// Before the harness declares a run "complete" (all features marked passing),
// it calls verifyTarget(repoPath) to actually run the project's build/test if
// one exists. This guards against agents marking features `passes: true` while
// the project doesn't build or its tests are red.
//
// Detection (in priority order):
//   1. package.json with a "test" script   → run it (npm/pnpm/yarn aware)
//   2. package.json with a "build" script   → run it
//   3. Python: pytest.ini / pyproject.toml [tool.pytest] / tests dir + pytest available → pytest
//
// Contract: returns { ran, passed, output }.
//   - ran=false  → no detectable build/test; treat as PASS upstream (no-op gate).
//   - ran=true   → passed reflects the command exit status (0 = passed).
// It NEVER throws for an expected "no gate / command failure" case; it only
// surfaces unexpected internal errors to the caller.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Hard cap so a hung build/test can't wedge the harness forever.
const GATE_TIMEOUT_MS = parseInt(process.env.ACD_VERIFY_TIMEOUT_MS || '600000', 10); // 10 min
const MAX_OUTPUT_CHARS = 20000; // keep returned output bounded

/**
 * Run a command, capture combined stdout+stderr, resolve with exit info.
 * Never rejects on a non-zero exit; only the spawn error path resolves with
 * spawnError set so the caller can decide how to treat it.
 */
function runCommand(cmd, args, cwd) {
  return new Promise((resolve) => {
    let output = '';
    let settled = false;
    let child;

    const append = (chunk) => {
      output += chunk.toString();
      if (output.length > MAX_OUTPUT_CHARS) {
        output = output.slice(-MAX_OUTPUT_CHARS);
      }
    };

    try {
      child = spawn(cmd, args, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      resolve({ code: null, output: e.message, spawnError: true });
      return;
    }

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 5000);
      finish({ code: null, output: output + `\n[verify-gate] command timed out after ${GATE_TIMEOUT_MS}ms`, timedOut: true });
    }, GATE_TIMEOUT_MS);

    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (err) => finish({ code: null, output: output + '\n' + err.message, spawnError: true }));
    child.on('close', (code) => finish({ code, output }));
  });
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Pick the package manager runner based on the lockfile present in the repo.
 * Defaults to npm.
 */
function detectNodeRunner(repoPath) {
  if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) return { bin: 'pnpm', runPrefix: ['run'] };
  if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) return { bin: 'yarn', runPrefix: [] }; // `yarn <script>`
  return { bin: 'npm', runPrefix: ['run'] };
}

/**
 * Detect whether a Python test setup exists that we can run with pytest.
 */
function hasPytestSetup(repoPath) {
  if (fs.existsSync(path.join(repoPath, 'pytest.ini'))) return true;
  if (fs.existsSync(path.join(repoPath, 'tox.ini'))) return true;
  if (fs.existsSync(path.join(repoPath, 'setup.cfg'))) {
    const cfg = (() => { try { return fs.readFileSync(path.join(repoPath, 'setup.cfg'), 'utf-8'); } catch { return ''; } })();
    if (cfg.includes('[tool:pytest]')) return true;
  }
  if (fs.existsSync(path.join(repoPath, 'pyproject.toml'))) {
    const toml = (() => { try { return fs.readFileSync(path.join(repoPath, 'pyproject.toml'), 'utf-8'); } catch { return ''; } })();
    if (toml.includes('[tool.pytest')) return true;
  }
  if (fs.existsSync(path.join(repoPath, 'tests')) || fs.existsSync(path.join(repoPath, 'test'))) return true;
  return false;
}

/**
 * Run the target repo's build/test if one is detectable.
 * @param {string} repoPath absolute path to the target project root
 * @returns {Promise<{ran:boolean, passed:boolean, output:string}>}
 */
export async function verifyTarget(repoPath) {
  if (!repoPath || !fs.existsSync(repoPath)) {
    return { ran: false, passed: true, output: `repo path not found: ${repoPath}` };
  }

  // ── 1 & 2: Node project (package.json with test/build script) ────────────
  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = readJsonSafe(pkgPath);
    const scripts = (pkg && pkg.scripts) || {};
    const runner = detectNodeRunner(repoPath);

    // Prefer test, then build. A common placeholder test script just echoes an
    // error and exits 1; treat that as "no real test" so we don't false-fail.
    const placeholderTest = /no test specified/i;

    if (scripts.test && !placeholderTest.test(scripts.test)) {
      const args = [...runner.runPrefix, 'test'];
      const res = await runCommand(runner.bin, args, repoPath);
      if (res.spawnError) {
        // Runner not installed / not on PATH — can't verify, treat as no-op pass.
        return { ran: false, passed: true, output: `test runner unavailable: ${res.output}` };
      }
      return { ran: true, passed: res.code === 0, output: res.output };
    }

    if (scripts.build) {
      const args = [...runner.runPrefix, 'build'];
      const res = await runCommand(runner.bin, args, repoPath);
      if (res.spawnError) {
        return { ran: false, passed: true, output: `build runner unavailable: ${res.output}` };
      }
      return { ran: true, passed: res.code === 0, output: res.output };
    }
    // package.json exists but no usable test/build script → fall through to Python check.
  }

  // ── 3: Python (pytest) ───────────────────────────────────────────────────
  if (hasPytestSetup(repoPath)) {
    // Run pytest via `python3 -m pytest` so it works whether or not the `pytest`
    // shim is on PATH. -q keeps output compact.
    const res = await runCommand('python3', ['-m', 'pytest', '-q'], repoPath);
    if (res.spawnError) {
      return { ran: false, passed: true, output: `pytest unavailable: ${res.output}` };
    }
    // pytest exit code 5 = "no tests collected" → nothing to verify, treat as pass.
    if (res.code === 5) {
      return { ran: false, passed: true, output: 'pytest collected no tests' };
    }
    return { ran: true, passed: res.code === 0, output: res.output };
  }

  // Nothing detectable → no-op pass.
  return { ran: false, passed: true, output: 'no build/test detected' };
}

export default { verifyTarget };
