import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const SERVER = new URL('./acd-mcp-server.js', import.meta.url);

function readJsonLine(stream, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for MCP response')), timeoutMs);

    stream.on('data', chunk => {
      buffer += chunk.toString();
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      clearTimeout(timeout);
      resolve(JSON.parse(buffer.slice(0, newline)));
    });
    stream.on('error', reject);
  });
}

test('acd_start opens its log descriptor before spawning the harness', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'acd-start-'));
  const dataDir = path.join(fixtureRoot, 'data');
  const targetPath = path.join(fixtureRoot, 'target');
  const promptPath = path.join(fixtureRoot, 'prompt.md');
  const featureListPath = path.join(fixtureRoot, 'features.json');
  await mkdir(targetPath, { recursive: true });
  await writeFile(promptPath, '# Completed fixture\n');
  await writeFile(featureListPath, JSON.stringify({
    slug: 'start-fixture',
    features: [{ id: 'FIX-001', title: 'Already complete', passes: true, status: 'done' }]
  }));

  const env = { ...process.env, ACD_DATA: dataDir };
  delete env.ANTHROPIC_API_KEY;
  delete env.ACTIVITY_PORT;

  const server = spawn(process.execPath, [SERVER.pathname], {
    cwd: path.dirname(SERVER.pathname),
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let harnessPid;
  try {
    const responsePromise = readJsonLine(server.stdout);
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'acd_start',
        arguments: {
          slug: 'start-fixture',
          promptPath,
          featureListPath,
          targetPath
        }
      }
    }) + '\n');

    const response = await responsePromise;
    assert.equal(response.error, undefined);
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.started, true);
    assert.equal(result.slug, 'start-fixture');
    assert.equal(typeof result.pid, 'number');
    harnessPid = result.pid;
  } finally {
    if (harnessPid) {
      try { process.kill(harnessPid, 'SIGTERM'); } catch { /* already exited */ }
    }
    server.kill('SIGTERM');
    await once(server, 'close').catch(() => {});
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
