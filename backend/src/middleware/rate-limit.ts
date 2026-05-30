/**
 * Rate Limiting Middleware
 * =========================
 *
 * Implements rate limiting for auth endpoints and API endpoints
 * using Redis for distributed rate limiting across multiple instances.
 *
 * Features: PCT-WC-032, PCT-WC-033
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

// ============================================
// TYPES
// ============================================

export interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Max requests per window
  keyPrefix: string;       // Redis key prefix
  skipSuccessfulRequests?: boolean;  // Don't count successful requests
  skipFailedRequests?: boolean;      // Don't count failed requests
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

// ============================================
// RATE LIMITER CLASS
// ============================================

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(redis: Redis, config: RateLimitConfig) {
    this.redis = redis;
    this.config = config;
  }

  /**
   * Get the identifier key for rate limiting
   */
  private getKey(identifier: string): string {
    return `${this.config.keyPrefix}:${identifier}`;
  }

  /**
   * Check if request should be allowed
   */
  async checkLimit(identifier: string): Promise<RateLimitInfo> {
    const key = this.getKey(identifier);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Remove old entries outside the window
    await this.redis.zremrangebyscore(key, 0, windowStart);

    // Count requests in current window
    const requestCount = await this.redis.zcard(key);

    // Calculate reset time
    const oldestEntry = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
    const resetTime = oldestEntry.length > 0
      ? parseInt(oldestEntry[1]) + this.config.windowMs
      : now + this.config.windowMs;

    const info: RateLimitInfo = {
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - requestCount),
      reset: resetTime,
    };

    // Check if limit exceeded
    if (requestCount >= this.config.maxRequests) {
      return info;
    }

    // Add current request to the window
    await this.redis.zadd(key, now, `${now}-${Math.random()}`);

    // Set expiry on the key to prevent memory leaks
    await this.redis.expire(key, Math.ceil(this.config.windowMs / 1000));

    info.remaining = Math.max(0, this.config.maxRequests - requestCount - 1);
    return info;
  }

  /**
   * Create Express middleware
   */
  middleware(options?: {
    keyGenerator?: (req: Request) => string;
    handler?: (req: Request, res: Response) => void;
  }) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Generate key for this request (IP by default, can be customized)
        const identifier = options?.keyGenerator
          ? options.keyGenerator(req)
          : this.getClientIdentifier(req);

        // Check rate limit
        const limitInfo = await this.checkLimit(identifier);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', limitInfo.limit);
        res.setHeader('X-RateLimit-Remaining', limitInfo.remaining);
        res.setHeader('X-RateLimit-Reset', new Date(limitInfo.reset).toISOString());

        // Check if limit exceeded
        if (limitInfo.remaining === 0) {
          const retryAfter = Math.ceil((limitInfo.reset - Date.now()) / 1000);
          res.setHeader('Retry-After', retryAfter);

          if (options?.handler) {
            return options.handler(req, res);
          }

          return res.status(429).json({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests. Please try again later.',
              retryAfter,
            },
          });
        }

        next();
      } catch (error) {
        console.error('Rate limiting error:', error);
        // Fail open - allow request if rate limiting fails
        next();
      }
    };
  }

  /**
   * Get client identifier (IP address with fallback)
   */
  private getClientIdentifier(req: Request): string {
    // Try to get real IP from proxy headers
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
      return ips[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string') {
      return realIp;
    }

    // Fallback to socket IP
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}

// ============================================
// PRESET CONFIGURATIONS
// ============================================

/**
 * Strict rate limit for auth endpoints (login, signup, password reset)
 * Prevents brute force attacks
 *
 * Feature: PCT-WC-032
 */
export function createAuthRateLimiter(redis: Redis): RateLimiter {
  return new RateLimiter(redis, {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxRequests: 5,             // 5 attempts per window
    keyPrefix: 'ratelimit:auth',
  });
}

/**
 * Moderate rate limit for general API endpoints
 *
 * Feature: PCT-WC-033
 */
export function createAPIRateLimiter(redis: Redis): RateLimiter {
  return new RateLimiter(redis, {
    windowMs: 1 * 60 * 1000,   // 1 minute
    maxRequests: 100,           // 100 requests per minute
    keyPrefix: 'ratelimit:api',
  });
}

/**
 * Per-user rate limiter for authenticated endpoints
 * Uses user ID instead of IP
 *
 * Feature: PCT-WC-033
 */
export function createUserRateLimiter(redis: Redis): RateLimiter {
  return new RateLimiter(redis, {
    windowMs: 1 * 60 * 1000,   // 1 minute
    maxRequests: 200,           // 200 requests per minute per user
    keyPrefix: 'ratelimit:user',
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Key generator that uses authenticated user ID
 */
export function userKeyGenerator(req: Request): string {
  const authReq = req as any;
  if (authReq.user?.userId) {
    return authReq.user.userId;
  }
  // Fallback to IP if not authenticated
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Key generator that combines IP and endpoint path for more granular control
 */
export function endpointKeyGenerator(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const path = req.path.replace(/\d+/g, ':id'); // Normalize IDs in path
  return `${ip}:${path}`;
}
