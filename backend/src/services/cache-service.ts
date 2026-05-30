/**
 * Server-Side Caching Service
 * Uses Redis for distributed caching with TTL and cache invalidation
 */

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface CacheOptions {
  ttl?: number; // Time to live in seconds (default: 300 = 5 minutes)
  tags?: string[]; // Cache tags for bulk invalidation
}

class CacheService {
  private defaultTTL = 300; // 5 minutes

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as T;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached value
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);

      await redis.setex(key, ttl, serialized);

      // Store cache tags for invalidation
      if (options?.tags) {
        for (const tag of options.tags) {
          await redis.sadd(`tag:${tag}`, key);
          await redis.expire(`tag:${tag}`, ttl);
        }
      }
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Invalidate all keys with a specific tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    try {
      const keys = await redis.smembers(`tag:${tag}`);

      if (keys.length === 0) {
        return 0;
      }

      await redis.del(...keys);
      await redis.del(`tag:${tag}`);

      return keys.length;
    } catch (error) {
      console.error('Cache invalidate error:', error);
      return 0;
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      await redis.flushdb();
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Wrap a function with caching (memoization pattern)
   */
  async remember<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    await this.set(key, value, options);

    return value;
  }

  /**
   * Generate cache key
   */
  generateKey(namespace: string, ...parts: (string | number)[]): string {
    return `${namespace}:${parts.join(':')}`;
  }
}

export const cacheService = new CacheService();

/**
 * Cache middleware for Express routes
 */
import { Request, Response, NextFunction } from 'express';

export function cacheMiddleware(options: CacheOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `http:${req.originalUrl}`;
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    res.setHeader('X-Cache', 'MISS');

    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function (data: any) {
      // Cache successful responses
      if (res.statusCode === 200) {
        cacheService.set(cacheKey, data, options).catch((err) => {
          console.error('Failed to cache response:', err);
        });
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Commonly used cache key patterns
 */
export const CacheKeys = {
  user: (userId: string) => `user:${userId}`,
  userProfile: (userId: string) => `user:${userId}:profile`,
  pctBrand: (brandId: string) => `pct:brand:${brandId}`,
  pctProduct: (productId: string) => `pct:product:${productId}`,
  pctUSPs: (productId: string) => `pct:usps:${productId}`,
  pctHooks: (angleId: string) => `pct:hooks:${angleId}`,
  apiRoute: (route: string, params?: string) =>
    params ? `api:${route}:${params}` : `api:${route}`,
};

/**
 * Cache tag patterns for invalidation
 */
export const CacheTags = {
  user: (userId: string) => `user-${userId}`,
  pctBrand: (brandId: string) => `brand-${brandId}`,
  pctProduct: (productId: string) => `product-${productId}`,
  allPCT: 'all-pct',
};

/**
 * Helper to invalidate cache on mutations
 */
export async function invalidateCacheOnMutation(tags: string[]) {
  for (const tag of tags) {
    await cacheService.invalidateByTag(tag);
  }
}
