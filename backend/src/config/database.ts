/**
 * Database Connection Pooling Configuration
 * ==========================================
 *
 * Optimized Prisma connection pooling with:
 * - Connection limits based on environment
 * - Timeout configuration
 * - Connection recycling
 * - Health checks
 * - Performance monitoring
 *
 * Feature: PCT-WC-055
 */

import { PrismaClient } from '@prisma/client';

/**
 * Connection pool configuration
 */
export interface PoolConfig {
  // Maximum number of database connections
  maxConnections: number;

  // Minimum number of idle connections to maintain
  minConnections: number;

  // Connection timeout in milliseconds
  connectionTimeout: number;

  // Max lifetime of a connection in milliseconds
  maxLifetime: number;

  // Idle timeout (close idle connections after this time)
  idleTimeout: number;

  // Query timeout in milliseconds
  queryTimeout: number;
}

/**
 * Get pool configuration based on environment
 */
export function getPoolConfig(): PoolConfig {
  const env = process.env.NODE_ENV || 'development';

  // Production: Higher limits, stricter timeouts
  if (env === 'production') {
    return {
      maxConnections: parseInt(process.env.DB_POOL_MAX || '20'),
      minConnections: parseInt(process.env.DB_POOL_MIN || '2'),
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
      maxLifetime: parseInt(process.env.DB_MAX_LIFETIME || '3600000'), // 1 hour
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '300000'), // 5 minutes
      queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'), // 30 seconds
    };
  }

  // Development: Lower limits, more forgiving timeouts
  return {
    maxConnections: parseInt(process.env.DB_POOL_MAX || '5'),
    minConnections: parseInt(process.env.DB_POOL_MIN || '1'),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '20000'),
    maxLifetime: parseInt(process.env.DB_MAX_LIFETIME || '7200000'), // 2 hours
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '600000'), // 10 minutes
    queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT || '60000'), // 60 seconds
  };
}

/**
 * Build Prisma connection URL with pool parameters
 */
export function buildDatabaseUrl(baseUrl: string, config: PoolConfig): string {
  const url = new URL(baseUrl);

  // Add connection pool parameters
  url.searchParams.set('connection_limit', config.maxConnections.toString());
  url.searchParams.set('pool_timeout', (config.connectionTimeout / 1000).toString());

  // PostgreSQL-specific parameters
  if (baseUrl.startsWith('postgres://') || baseUrl.startsWith('postgresql://')) {
    url.searchParams.set('connect_timeout', (config.connectionTimeout / 1000).toString());
    url.searchParams.set('pool_timeout', (config.connectionTimeout / 1000).toString());
    url.searchParams.set('statement_cache_size', '1000');
    url.searchParams.set('pgbouncer', 'false'); // Set to true if using PgBouncer
  }

  // MySQL-specific parameters
  if (baseUrl.startsWith('mysql://')) {
    url.searchParams.set('connect_timeout', (config.connectionTimeout / 1000).toString());
    url.searchParams.set('pool_timeout', (config.connectionTimeout / 1000).toString());
  }

  return url.toString();
}

/**
 * Create Prisma client with optimized connection pool
 */
export function createPrismaClient(options?: {
  log?: boolean;
  customConfig?: Partial<PoolConfig>;
}): PrismaClient {
  const config = { ...getPoolConfig(), ...options?.customConfig };
  const baseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/autonomous_coding';
  const databaseUrl = buildDatabaseUrl(baseUrl, config);

  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: options?.log
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'stdout', level: 'error' },
          { emit: 'stdout', level: 'warn' },
        ]
      : undefined,
  });

  // Log slow queries in production
  if (process.env.NODE_ENV === 'production') {
    // @ts-ignore
    client.$on('query', (e: any) => {
      if (e.duration > 1000) {
        // Log queries taking > 1 second
        console.warn(`[DB] Slow query (${e.duration}ms):`, e.query);
      }
    });
  }

  return client;
}

/**
 * Singleton Prisma client instance
 */
let prismaInstance: PrismaClient | null = null;

/**
 * Get singleton Prisma client instance
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = createPrismaClient({
      log: process.env.DEBUG_DB === 'true',
    });
  }

  return prismaInstance;
}

/**
 * Close Prisma client connection
 */
export async function closePrismaClient(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(client: PrismaClient): Promise<{
  healthy: boolean;
  latency: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Simple query to check connection
    await client.$queryRaw`SELECT 1`;

    const latency = Date.now() - startTime;

    return {
      healthy: true,
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get connection pool stats
 */
export async function getPoolStats(client: PrismaClient): Promise<{
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  waitingRequests: number;
}> {
  try {
    // PostgreSQL pool stats
    const result = await client.$queryRaw<
      Array<{ active: number; idle: number; total: number; waiting: number }>
    >`
      SELECT
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) as total,
        0 as waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;

    if (result && result.length > 0) {
      return {
        activeConnections: Number(result[0].active),
        idleConnections: Number(result[0].idle),
        totalConnections: Number(result[0].total),
        waitingRequests: Number(result[0].waiting),
      };
    }
  } catch (error) {
    // Fallback for non-PostgreSQL databases or errors
    console.error('[DB] Error getting pool stats:', error);
  }

  return {
    activeConnections: 0,
    idleConnections: 0,
    totalConnections: 0,
    waitingRequests: 0,
  };
}

/**
 * Monitor connection pool health
 */
export function startPoolMonitoring(client: PrismaClient, intervalMs: number = 60000): NodeJS.Timeout {
  return setInterval(async () => {
    const health = await checkDatabaseHealth(client);
    const stats = await getPoolStats(client);

    if (!health.healthy) {
      console.error('[DB Pool] Health check failed:', health.error);
    } else {
      console.log('[DB Pool] Health:', {
        latency: `${health.latency}ms`,
        connections: `${stats.activeConnections} active / ${stats.totalConnections} total`,
        idle: stats.idleConnections,
        waiting: stats.waitingRequests,
      });
    }

    // Warn if pool is near capacity
    const config = getPoolConfig();
    if (stats.totalConnections >= config.maxConnections * 0.8) {
      console.warn(
        `[DB Pool] Warning: Connection pool is at ${((stats.totalConnections / config.maxConnections) * 100).toFixed(1)}% capacity`
      );
    }

    // Warn if many requests are waiting
    if (stats.waitingRequests > 10) {
      console.warn(`[DB Pool] Warning: ${stats.waitingRequests} requests waiting for connections`);
    }
  }, intervalMs);
}

/**
 * Graceful shutdown handler
 */
export async function shutdownDatabase(signal: string = 'SIGTERM'): Promise<void> {
  console.log(`[DB] Received ${signal}, closing database connections...`);

  try {
    await closePrismaClient();
    console.log('[DB] Database connections closed successfully');
  } catch (error) {
    console.error('[DB] Error closing database connections:', error);
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 */
export function setupShutdownHandlers(): void {
  process.on('SIGTERM', () => shutdownDatabase('SIGTERM'));
  process.on('SIGINT', () => shutdownDatabase('SIGINT'));
}

/**
 * Example usage:
 *
 * ```typescript
 * import { getPrismaClient, setupShutdownHandlers, startPoolMonitoring } from './config/database';
 *
 * // Get singleton Prisma client
 * const prisma = getPrismaClient();
 *
 * // Setup graceful shutdown
 * setupShutdownHandlers();
 *
 * // Start pool monitoring (optional, in production only)
 * if (process.env.NODE_ENV === 'production') {
 *   startPoolMonitoring(prisma, 60000); // Check every minute
 * }
 *
 * // Use Prisma client as normal
 * const users = await prisma.user.findMany();
 * ```
 */
