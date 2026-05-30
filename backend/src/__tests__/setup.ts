/**
 * Vitest Global Setup
 *
 * CF-WC Test Setup - Initializes test environment for all unit and integration tests
 */

import { beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Type augmentation for custom matchers registered via expect.extend in test files.
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeOneOf(expected: any[]): T;
  }
  interface AsymmetricMatchersContaining {
    toBeOneOf(expected: any[]): any;
  }
}

// Mock Prisma client for tests
export const mockPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
    },
  },
});

beforeAll(async () => {
  // Setup: Run migrations or seed test database if needed
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key';
});

afterEach(async () => {
  // Cleanup: Clear test data after each test
  // This would typically clean up test database records
});

afterAll(async () => {
  // Teardown: Disconnect from database
  await mockPrisma.$disconnect();
});
