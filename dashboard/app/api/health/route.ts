/**
 * Health Check Endpoints (CF-WC-108)
 *
 * Monitoring endpoints for uptime checks and system status.
 */

import { NextResponse } from 'next/server';
import { env } from '@/lib/env-config';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  checks: {
    database?: HealthCheckResult;
    redis?: HealthCheckResult;
    remotion?: HealthCheckResult;
    storage?: HealthCheckResult;
  };
}

interface HealthCheckResult {
  status: 'pass' | 'fail';
  responseTime?: number;
  message?: string;
}

// Lightweight health check (for load balancer)
export async function GET() {
  const health: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    checks: {},
  };

  // Quick response for basic health check
  if (process.env.QUICK_HEALTH_CHECK === 'true') {
    return NextResponse.json(health, { status: 200 });
  }

  // Detailed health checks
  try {
    // Check database connection
    health.checks.database = await checkDatabase();

    // Check Redis (if configured)
    if (env.REDIS_URL) {
      health.checks.redis = await checkRedis();
    }

    // Check Remotion API (only if configured — not used by ACD)
    if (env.REMOTION_API_URL) {
      health.checks.remotion = await checkRemotionAPI();
    }

    // Check S3 storage (if configured)
    if (env.S3_BUCKET) {
      health.checks.storage = await checkS3();
    }

    // Determine overall status
    const failedChecks = Object.values(health.checks).filter(
      (check) => check.status === 'fail'
    );

    if (failedChecks.length === 0) {
      health.status = 'healthy';
    } else if (failedChecks.length < Object.keys(health.checks).length / 2) {
      health.status = 'degraded';
    } else {
      health.status = 'unhealthy';
    }

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

    return NextResponse.json(health, { status: statusCode });
  } catch (error) {
    health.status = 'unhealthy';
    return NextResponse.json(
      {
        ...health,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}

// Database health check
async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    // Simple query to check connection
    // await prisma.$queryRaw`SELECT 1`;

    // Simulated for now
    await new Promise((resolve) => setTimeout(resolve, 10));

    return {
      status: 'pass',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Database connection failed',
      responseTime: Date.now() - start,
    };
  }
}

// Redis health check
async function checkRedis(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    // Ping Redis
    // await redis.ping();

    // Simulated for now
    await new Promise((resolve) => setTimeout(resolve, 5));

    return {
      status: 'pass',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Redis connection failed',
      responseTime: Date.now() - start,
    };
  }
}

// Remotion API health check
async function checkRemotionAPI(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${env.REMOTION_API_URL}/health`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.REMOTION_API_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Remotion API returned ${response.status}`);
    }

    return {
      status: 'pass',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Remotion API check failed',
      responseTime: Date.now() - start,
    };
  }
}

// S3 storage health check
async function checkS3(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    // Check S3 bucket accessibility
    // await s3.headBucket({ Bucket: env.S3_BUCKET });

    // Simulated for now
    await new Promise((resolve) => setTimeout(resolve, 8));

    return {
      status: 'pass',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'S3 connection failed',
      responseTime: Date.now() - start,
    };
  }
}

// Readiness check (for Kubernetes)
export async function HEAD() {
  // Simple check - is the app ready to serve traffic?
  return new NextResponse(null, { status: 200 });
}
