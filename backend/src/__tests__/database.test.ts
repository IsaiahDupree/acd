/**
 * Database Connection Pooling Tests
 * ==================================
 *
 * Tests for PCT-WC-055: Database connection pooling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPoolConfig,
  buildDatabaseUrl,
  createPrismaClient,
  checkDatabaseHealth,
} from '../config/database';

describe('Database Connection Pooling (PCT-WC-055)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getPoolConfig', () => {
    it('should return production config when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';

      const config = getPoolConfig();

      expect(config.maxConnections).toBeGreaterThan(0);
      expect(config.minConnections).toBeGreaterThan(0);
      expect(config.maxConnections).toBeGreaterThanOrEqual(config.minConnections);
      expect(config.connectionTimeout).toBeGreaterThan(0);
      expect(config.maxLifetime).toBeGreaterThan(0);
      expect(config.idleTimeout).toBeGreaterThan(0);
      expect(config.queryTimeout).toBeGreaterThan(0);
    });

    it('should return development config when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';

      const config = getPoolConfig();

      expect(config.maxConnections).toBeGreaterThan(0);
      expect(config.minConnections).toBeGreaterThan(0);
      expect(config.connectionTimeout).toBeGreaterThan(0);
    });

    it('should use environment variables for custom pool sizes', () => {
      process.env.DB_POOL_MAX = '30';
      process.env.DB_POOL_MIN = '5';
      process.env.DB_CONNECTION_TIMEOUT = '15000';

      const config = getPoolConfig();

      expect(config.maxConnections).toBe(30);
      expect(config.minConnections).toBe(5);
      expect(config.connectionTimeout).toBe(15000);
    });

    it('should have reasonable default values', () => {
      const config = getPoolConfig();

      // Reasonable limits
      expect(config.maxConnections).toBeLessThanOrEqual(100);
      expect(config.minConnections).toBeLessThanOrEqual(config.maxConnections);
      expect(config.connectionTimeout).toBeLessThanOrEqual(60000); // 1 minute max
    });

    it('should have production pool larger than development', () => {
      process.env.NODE_ENV = 'production';
      const prodConfig = getPoolConfig();

      process.env.NODE_ENV = 'development';
      const devConfig = getPoolConfig();

      expect(prodConfig.maxConnections).toBeGreaterThanOrEqual(devConfig.maxConnections);
    });
  });

  describe('buildDatabaseUrl', () => {
    it('should build PostgreSQL URL with pool parameters', () => {
      const baseUrl = 'postgresql://user:pass@localhost:5432/mydb';
      const config = {
        maxConnections: 20,
        minConnections: 2,
        connectionTimeout: 10000,
        maxLifetime: 3600000,
        idleTimeout: 300000,
        queryTimeout: 30000,
      };

      const url = buildDatabaseUrl(baseUrl, config);

      expect(url).toContain('connection_limit=20');
      expect(url).toContain('pool_timeout=10');
      expect(url).toContain('connect_timeout=10');
    });

    it('should preserve existing query parameters', () => {
      const baseUrl = 'postgresql://user:pass@localhost:5432/mydb?schema=public';
      const config = {
        maxConnections: 10,
        minConnections: 1,
        connectionTimeout: 5000,
        maxLifetime: 3600000,
        idleTimeout: 300000,
        queryTimeout: 30000,
      };

      const url = buildDatabaseUrl(baseUrl, config);

      expect(url).toContain('schema=public');
      expect(url).toContain('connection_limit=10');
    });

    it('should handle MySQL URLs', () => {
      const baseUrl = 'mysql://user:pass@localhost:3306/mydb';
      const config = {
        maxConnections: 15,
        minConnections: 2,
        connectionTimeout: 8000,
        maxLifetime: 3600000,
        idleTimeout: 300000,
        queryTimeout: 30000,
      };

      const url = buildDatabaseUrl(baseUrl, config);

      expect(url).toContain('connection_limit=15');
      expect(url).toContain('connect_timeout=8');
    });

    it('should convert milliseconds to seconds for timeout parameters', () => {
      const baseUrl = 'postgresql://localhost:5432/mydb';
      const config = {
        maxConnections: 10,
        minConnections: 1,
        connectionTimeout: 15000, // 15 seconds in ms
        maxLifetime: 3600000,
        idleTimeout: 300000,
        queryTimeout: 30000,
      };

      const url = buildDatabaseUrl(baseUrl, config);

      // Should convert 15000ms to 15 seconds
      expect(url).toContain('connect_timeout=15');
      expect(url).toContain('pool_timeout=15');
    });
  });

  describe('createPrismaClient', () => {
    it('should create Prisma client with default config', () => {
      const client = createPrismaClient();

      expect(client).toBeDefined();
      expect(typeof client.$connect).toBe('function');
      expect(typeof client.$disconnect).toBe('function');
    });

    it('should create Prisma client with custom config', () => {
      const customConfig = {
        maxConnections: 25,
        minConnections: 3,
      };

      const client = createPrismaClient({ customConfig });

      expect(client).toBeDefined();
    });

    it('should enable logging when log option is true', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const client = createPrismaClient({ log: true });

      expect(client).toBeDefined();

      consoleSpy.mockRestore();
    });
  });

  describe('checkDatabaseHealth', () => {
    it('should return health status structure', async () => {
      const mockClient: any = {
        $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
      };

      const health = await checkDatabaseHealth(mockClient);

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('latency');
      expect(typeof health.healthy).toBe('boolean');
      expect(typeof health.latency).toBe('number');
    });

    it('should return healthy status when query succeeds', async () => {
      const mockClient: any = {
        $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
      };

      const health = await checkDatabaseHealth(mockClient);

      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.error).toBeUndefined();
    });

    it('should return unhealthy status when query fails', async () => {
      const mockClient: any = {
        $queryRaw: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };

      const health = await checkDatabaseHealth(mockClient);

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Connection failed');
    });

    it('should measure latency accurately', async () => {
      const mockClient: any = {
        $queryRaw: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve([{ result: 1 }]), 10);
            })
        ),
      };

      const health = await checkDatabaseHealth(mockClient);

      expect(health.latency).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Connection pool validation', () => {
    it('should enforce minimum connections less than maximum', () => {
      process.env.DB_POOL_MAX = '10';
      process.env.DB_POOL_MIN = '2';

      const config = getPoolConfig();

      expect(config.minConnections).toBeLessThanOrEqual(config.maxConnections);
    });

    it('should have reasonable timeout values', () => {
      const config = getPoolConfig();

      // Connection timeout should be reasonable (not too short, not too long)
      expect(config.connectionTimeout).toBeGreaterThanOrEqual(1000); // At least 1 second
      expect(config.connectionTimeout).toBeLessThanOrEqual(60000); // At most 1 minute

      // Query timeout should be reasonable
      expect(config.queryTimeout).toBeGreaterThanOrEqual(5000); // At least 5 seconds
      expect(config.queryTimeout).toBeLessThanOrEqual(120000); // At most 2 minutes
    });

    it('should have max lifetime greater than idle timeout', () => {
      const config = getPoolConfig();

      expect(config.maxLifetime).toBeGreaterThanOrEqual(config.idleTimeout);
    });
  });
});
