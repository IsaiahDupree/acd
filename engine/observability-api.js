#!/usr/bin/env node
/**
 * observability-api.js — REST routes for the observability mesh
 *
 * Wired into the existing backend on port 3434 (live-ops-server.js or polsia-orchestrator.js).
 * Can also be imported and router attached to any Express app.
 *
 * Routes:
 *   GET  /api/obs/nodes               — all node statuses
 *   GET  /api/obs/nodes/:nodeId       — single node detail
 *   GET  /api/obs/workers             — all worker statuses (latest per worker)
 *   GET  /api/obs/commands            — recent commands with status
 *   GET  /api/obs/commands/:commandId — command detail + events
 *   GET  /api/obs/browsers            — browser session health
 *   POST /api/obs/command             — issue a new command
 *   GET  /api/obs/fleet               — full fleet snapshot (<500ms)
 */

import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ivhfuhxorppptyuofbgq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const NODE_ID      = process.env.NODE_ID || 'mac-mini-main';

const SB = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

// ── Supabase helpers ─────────────────────────────────────────────────────────
async function sbGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SB });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: SB,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase insert ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Response helpers ──────────────────────────────────────────────────────────
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function err(res, msg, status = 500) {
  json(res, { error: msg }, status);
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function getNodes(req, res) {
  try {
    const rows = await sbGet('agent_nodes', 'order=updated_at.desc&limit=50');
    json(res, { nodes: rows });
  } catch (e) { err(res, e.message); }
}

async function getNodeById(req, res, nodeId) {
  try {
    const rows = await sbGet('agent_nodes', `node_id=eq.${encodeURIComponent(nodeId)}&limit=1`);
    if (!rows.length) return err(res, 'Node not found', 404);
    json(res, { node: rows[0] });
  } catch (e) { err(res, e.message); }
}

async function getWorkers(req, res) {
  try {
    // Get latest worker_status row per worker_name (using a workaround since no DISTINCT ON via REST)
    const rows = await sbGet('worker_status', 'order=reported_at.desc&limit=200');
    // Deduplicate: keep latest per (node_id, worker_name)
    const seen = new Map();
    for (const row of rows) {
      const key = `${row.node_id}::${row.worker_name}`;
      if (!seen.has(key)) seen.set(key, row);
    }
    json(res, { workers: Array.from(seen.values()) });
  } catch (e) { err(res, e.message); }
}

async function getCommands(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const status = url.searchParams.get('status');
    const query = status
      ? `status=eq.${encodeURIComponent(status)}&order=issued_at.desc&limit=${limit}`
      : `order=issued_at.desc&limit=${limit}`;
    const rows = await sbGet('command_queue', query);
    json(res, { commands: rows, total: rows.length });
  } catch (e) { err(res, e.message); }
}

async function getCommandById(req, res, commandId) {
  try {
    const [cmdRows, eventRows] = await Promise.all([
      sbGet('command_queue', `command_id=eq.${encodeURIComponent(commandId)}&limit=1`),
      sbGet('command_events', `command_id=eq.${encodeURIComponent(commandId)}&order=timestamp.asc`),
    ]);
    if (!cmdRows.length) return err(res, 'Command not found', 404);
    json(res, { command: cmdRows[0], events: eventRows });
  } catch (e) { err(res, e.message); }
}

async function getBrowserSessions(req, res) {
  try {
    const rows = await sbGet('browser_sessions', 'order=last_check_at.desc&limit=50');
    // Deduplicate: latest per (node_id, browser)
    const seen = new Map();
    for (const row of rows) {
      const key = `${row.node_id}::${row.browser}`;
      if (!seen.has(key)) seen.set(key, row);
    }
    json(res, { sessions: Array.from(seen.values()) });
  } catch (e) { err(res, e.message); }
}

async function postCommand(req, res, body) {
  try {
    const {
      command_type,
      inputs = {},
      node_target = NODE_ID,
      worker_target,
      priority = 'normal',
      goal_id,
      constraints = {},
    } = body;

    if (!command_type) return err(res, 'command_type required', 400);

    const command_id = `cmd-${randomUUID()}`;
    const row = {
      command_id,
      goal_id: goal_id || null,
      node_target,
      worker_target: worker_target || (command_type.startsWith('safari_') ? 'safari-worker' : 'chrome-worker'),
      command_type,
      priority,
      inputs,
      constraints,
      status: 'queued',
      issued_at: new Date().toISOString(),
    };

    await sbPost('command_queue', row);
    json(res, { ok: true, command_id, status: 'queued' }, 201);
  } catch (e) { err(res, e.message); }
}

async function getFleet(req, res) {
  const start = Date.now();
  try {
    const [nodes, workerRows, browserRows, cmdRows] = await Promise.all([
      sbGet('agent_nodes', 'order=updated_at.desc&limit=10'),
      sbGet('worker_status', 'order=reported_at.desc&limit=200'),
      sbGet('browser_sessions', 'order=last_check_at.desc&limit=20'),
      sbGet('command_queue', 'status=eq.queued&order=issued_at.asc&limit=100'),
    ]);

    // Deduplicate workers
    const workerMap = new Map();
    for (const w of workerRows) {
      const k = `${w.node_id}::${w.worker_name}`;
      if (!workerMap.has(k)) workerMap.set(k, w);
    }

    // Deduplicate browsers
    const browserMap = new Map();
    for (const b of browserRows) {
      const k = `${b.node_id}::${b.browser}`;
      if (!browserMap.has(k)) browserMap.set(k, b);
    }

    // Stale check (heartbeat > 60s ago)
    const staleThreshold = new Date(Date.now() - 60_000).toISOString();
    const nodesWithHealth = nodes.map(n => ({
      ...n,
      is_stale: !n.last_heartbeat_at || n.last_heartbeat_at < staleThreshold,
    }));

    const elapsed = Date.now() - start;
    json(res, {
      ok: true,
      elapsed_ms: elapsed,
      timestamp: new Date().toISOString(),
      nodes: nodesWithHealth,
      workers: Array.from(workerMap.values()),
      browser_sessions: Array.from(browserMap.values()),
      queue_depth: cmdRows.length,
      queued_commands: cmdRows.slice(0, 10),
    });
  } catch (e) { err(res, e.message); }
}

// ── Router function — attach to Node http.IncomingMessage handler ─────────────
export async function handleObsRequest(req, res) {
  const url = req.url || '';

  // Strip query for path matching
  const pathname = url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // GET /api/obs/fleet
  if (req.method === 'GET' && pathname === '/api/obs/fleet') return getFleet(req, res);
  // GET /api/obs/nodes
  if (req.method === 'GET' && pathname === '/api/obs/nodes') return getNodes(req, res);
  // GET /api/obs/nodes/:nodeId
  const nodeMatch = pathname.match(/^\/api\/obs\/nodes\/([^/]+)$/);
  if (req.method === 'GET' && nodeMatch) return getNodeById(req, res, nodeMatch[1]);
  // GET /api/obs/workers
  if (req.method === 'GET' && pathname === '/api/obs/workers') return getWorkers(req, res);
  // GET /api/obs/commands
  if (req.method === 'GET' && pathname === '/api/obs/commands') return getCommands(req, res);
  // GET /api/obs/commands/:commandId
  const cmdMatch = pathname.match(/^\/api\/obs\/commands\/([^/]+)$/);
  if (req.method === 'GET' && cmdMatch) return getCommandById(req, res, cmdMatch[1]);
  // GET /api/obs/browsers
  if (req.method === 'GET' && pathname === '/api/obs/browsers') return getBrowserSessions(req, res);
  // POST /api/obs/command
  if (req.method === 'POST' && pathname === '/api/obs/command') {
    let body = {};
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch { /* use empty body */ }
    return postCommand(req, res, body);
  }

  // Not matched
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ── Standalone server mode (for testing) ─────────────────────────────────────
import { fileURLToPath as _fup } from 'url';
const _isMain = process.argv[1] && _fup(import.meta.url) === process.argv[1];
if (_isMain) {
  const { createServer } = await import('http');
  const PORT = parseInt(process.env.OBS_API_PORT || '3435', 10);
  const server = createServer(async (req, res) => {
    const handled = await handleObsRequest(req, res).catch(e => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
      return true;
    });
    if (handled === null) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', path: req.url }));
    }
  });
  server.listen(PORT, () => {
    console.log(`[observability-api] Standalone server listening on :${PORT}`);
    console.log(`  GET  http://localhost:${PORT}/api/obs/fleet`);
    console.log(`  GET  http://localhost:${PORT}/api/obs/nodes`);
    console.log(`  POST http://localhost:${PORT}/api/obs/command`);
  });
}
