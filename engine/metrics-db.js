/**
 * ACD Metrics Database Module
 * ===========================
 * 
 * Tracks per-target session metrics in PostgreSQL.
 * Stores tokens, costs, features completed, and session durations.
 */

import pg from 'pg';
const { Pool } = pg;

const DEFAULT_CONFIG = {
  host: process.env.METRICS_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.METRICS_DB_PORT || '5433'),
  database: process.env.METRICS_DB_NAME || 'acd_database',
  user: process.env.METRICS_DB_USER || 'acd_user',
  password: process.env.METRICS_DB_PASSWORD,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool(DEFAULT_CONFIG);
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function testConnection() {
  const client = await getPool().connect();
  try {
    const result = await client.query('SELECT NOW() as time');
    return { connected: true, time: result.rows[0].time };
  } finally {
    client.release();
  }
}

// ============================================
// Target Management
// ============================================

export async function ensureTarget(targetId, name, path = null) {
  const client = await getPool().connect();
  try {
    // Use Prisma schema table/column names (camelCase in DB)
    const result = await client.query(
      `INSERT INTO targets (id, repo_id, name, path, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
       ON CONFLICT (repo_id) DO UPDATE SET
         name = EXCLUDED.name,
         path = COALESCE(EXCLUDED.path, targets.path),
         "updatedAt" = NOW()
       RETURNING *`,
      [targetId, name, path || '']
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function getTarget(targetId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT * FROM targets WHERE repo_id = $1',
      [targetId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

export async function syncTargetProgress(targetId, passingFeatures, totalFeatures) {
  const client = await getPool().connect();
  try {
    const percentComplete = totalFeatures > 0 ? (passingFeatures / totalFeatures) * 100 : 0;
    const status = percentComplete >= 100 ? 'complete' : 'pending';
    
    const result = await client.query(
      `UPDATE targets SET
         passing_features = $2,
         total_features = $3,
         percent_complete = $4,
         status = $5,
         last_session_at = NOW(),
         "updatedAt" = NOW()
       WHERE repo_id = $1
       RETURNING *`,
      [targetId, passingFeatures, totalFeatures, percentComplete, status]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// ============================================
// Session Tracking
// ============================================

export async function startSession(targetId, sessionNumber, sessionType = 'coding', model = 'haiku') {
  const client = await getPool().connect();
  try {
    // First get the target's internal ID
    const targetResult = await client.query(
      'SELECT id FROM targets WHERE repo_id = $1',
      [targetId]
    );
    if (!targetResult.rows[0]) {
      throw new Error(`Target not found: ${targetId}`);
    }
    const internalTargetId = targetResult.rows[0].id;
    
    const result = await client.query(
      `INSERT INTO harness_sessions (id, target_id, session_number, session_type, model, status, started_at, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'running', NOW(), NOW())
       RETURNING id, started_at`,
      [internalTargetId, sessionNumber, sessionType, model]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function endSession(sessionId, metrics = {}) {
  const client = await getPool().connect();
  try {
    // Calculate cache hit rate
    const totalInput = (metrics.inputTokens || 0) + (metrics.cacheReadTokens || 0);
    const cacheHitRate = totalInput > 0 ? (metrics.cacheReadTokens || 0) / totalInput : 0;
    
    // Calculate context utilization (assuming 200K context window)
    const totalTokens = (metrics.inputTokens || 0) + (metrics.outputTokens || 0) + 
                        (metrics.cacheReadTokens || 0) + (metrics.cacheWriteTokens || 0);
    const contextUtilization = totalTokens / 200000;
    
    // Calculate test pass rate
    const testsRun = (metrics.testsPassed || 0) + (metrics.testsFailed || 0);
    const testPassRate = testsRun > 0 ? (metrics.testsPassed || 0) / testsRun : null;
    
    const result = await client.query(
      `UPDATE harness_sessions SET
         status = $2,
         finished_at = NOW(),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
         input_tokens = $3,
         output_tokens = $4,
         cache_read_tokens = $5,
         cache_write_tokens = $6,
         cost_usd = $7,
         features_before = $8,
         features_after = $9,
         features_completed = $10,
         error_type = $11,
         error_message = $12,
         commits_made = $13,
         api_latency_ms = $14,
         wall_clock_ms = $15,
         turn_count = $16,
         retry_count = $17,
         model_fallbacks = $18,
         tests_run = $19,
         tests_passed = $20,
         tests_failed = $21,
         test_pass_rate = $22,
         context_utilization = $23,
         cache_hit_rate = $24
       WHERE id = $1
       RETURNING *`,
      [
        sessionId,
        metrics.status || 'completed',
        metrics.inputTokens || 0,
        metrics.outputTokens || 0,
        metrics.cacheReadTokens || 0,
        metrics.cacheWriteTokens || 0,
        metrics.costUsd || 0,
        metrics.featuresBefore || 0,
        metrics.featuresAfter || 0,
        metrics.featuresCompleted || 0,
        metrics.errorType || null,
        metrics.errorMessage || null,
        metrics.commitsMade || 0,
        metrics.apiLatencyMs || 0,
        metrics.wallClockMs || 0,
        metrics.turnCount || 0,
        metrics.retryCount || 0,
        metrics.modelFallbacks || 0,
        metrics.testsRun || 0,
        metrics.testsPassed || 0,
        metrics.testsFailed || 0,
        testPassRate,
        contextUtilization,
        cacheHitRate
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function getSessionsByTarget(targetId, limit = 100) {
  const client = await getPool().connect();
  try {
    // Get target internal ID first
    const targetResult = await client.query(
      'SELECT id FROM targets WHERE repo_id = $1',
      [targetId]
    );
    if (!targetResult.rows[0]) return [];
    
    const result = await client.query(
      `SELECT * FROM harness_sessions 
       WHERE target_id = $1 
       ORDER BY started_at DESC 
       LIMIT $2`,
      [targetResult.rows[0].id, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// ============================================
// Daily Stats Aggregation
// ============================================

export async function updateDailyStats(targetId, totalFeaturesOverride = null, date = null) {
  const statsDate = date || new Date().toISOString().split('T')[0];
  const client = await getPool().connect();
  
  try {
    // Get target internal ID
    const targetResult = await client.query(
      'SELECT id, total_features FROM targets WHERE repo_id = $1',
      [targetId]
    );
    if (!targetResult.rows[0]) return null;
    const internalTargetId = targetResult.rows[0].id;
    const totalFeatures = totalFeaturesOverride || targetResult.rows[0].total_features || 0;
    
    // Calculate session stats for the day
    const statsResult = await client.query(
      `SELECT 
         COALESCE(SUM(input_tokens + output_tokens), 0)::integer as tokens_today,
         COALESCE(SUM(cost_usd), 0) as cost_today,
         COUNT(*)::integer as sessions_today,
         MAX(features_after) as max_features
       FROM harness_sessions
       WHERE target_id = $1 AND DATE(started_at) = $2::date`,
      [internalTargetId, statsDate]
    );
    const stats = statsResult.rows[0];
    const passingFeatures = stats.max_features || 0;
    const percentComplete = totalFeatures > 0 ? (passingFeatures / totalFeatures) * 100 : 0;
    
    // Upsert into progress_snapshots
    const result = await client.query(
      `INSERT INTO progress_snapshots (id, target_id, total_features, passing_features, percent_complete,
         sessions_today, tokens_today, cost_today, snapshot_date, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::date, NOW())
       ON CONFLICT (target_id, snapshot_date) DO UPDATE SET
         passing_features = EXCLUDED.passing_features,
         percent_complete = EXCLUDED.percent_complete,
         sessions_today = EXCLUDED.sessions_today,
         tokens_today = EXCLUDED.tokens_today,
         cost_today = EXCLUDED.cost_today
       RETURNING *`,
      [internalTargetId, totalFeatures, passingFeatures, percentComplete,
       stats.sessions_today, stats.tokens_today, stats.cost_today, statsDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// ============================================
// Summary Queries
// ============================================

export async function getTargetSummary(targetId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT t.*, 
         (SELECT COUNT(*) FROM harness_sessions hs WHERE hs.target_id = t.id) as total_sessions,
         (SELECT COALESCE(SUM(cost_usd), 0) FROM harness_sessions hs WHERE hs.target_id = t.id) as total_cost
       FROM targets t WHERE t.repo_id = $1`,
      [targetId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

export async function getAllTargetSummaries() {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT t.*, 
         (SELECT COUNT(*) FROM harness_sessions hs WHERE hs.target_id = t.id) as total_sessions,
         (SELECT COALESCE(SUM(cost_usd), 0) FROM harness_sessions hs WHERE hs.target_id = t.id) as total_cost
       FROM targets t
       ORDER BY total_cost DESC`
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getCostByTarget() {
  const client = await getPool().connect();
  try {
    const result = await client.query(`
      SELECT 
        t.repo_id as target_id,
        t.name as target_name,
        COALESCE(SUM(hs.cost_usd), 0) as total_cost,
        COALESCE(SUM(hs.input_tokens), 0) as total_input,
        COALESCE(SUM(hs.output_tokens), 0) as total_output,
        COUNT(hs.id) as sessions
      FROM targets t
      LEFT JOIN harness_sessions hs ON hs.target_id = t.id
      GROUP BY t.id, t.repo_id, t.name
      ORDER BY total_cost DESC
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getCostByDate(days = 30) {
  const client = await getPool().connect();
  try {
    const result = await client.query(`
      SELECT 
        DATE(started_at) as date,
        SUM(cost_usd) as total_cost,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        COUNT(*) as sessions
      FROM harness_sessions
      WHERE started_at > NOW() - ($1::int * INTERVAL '1 day')
      GROUP BY DATE(started_at)
      ORDER BY date DESC
    `, [parseInt(days, 10)]);
    return result.rows;
  } finally {
    client.release();
  }
}

export default {
  getPool,
  closePool,
  testConnection,
  ensureTarget,
  getTarget,
  startSession,
  endSession,
  getSessionsByTarget,
  updateDailyStats,
  getTargetSummary,
  getAllTargetSummaries,
  getCostByTarget,
  getCostByDate,
};
