/**
 * PCT-WC-025: Test coverage configuration and thresholds
 * Vitest coverage configuration for backend tests
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: './coverage',

      // Coverage thresholds
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 70,
        statements: 80,
      },

      // Include files
      include: ['src/**/*.{ts,tsx,js,jsx}'],

      // Exclude files
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.test.{ts,tsx,js,jsx}',
        '**/*.spec.{ts,tsx,js,jsx}',
        '**/types.ts',
        '**/index.ts',
        '**/*.d.ts',
      ],

      // Clean coverage results before running tests
      clean: true,

      // Skip empty files
      skipFull: false,

      // Report all files, even those with 0% coverage
      all: true,
    },

    // Test environment
    environment: 'node',

    // Global test setup
    globals: true,

    // Test timeout
    testTimeout: 10000,

    // Hook timeout
    hookTimeout: 10000,
  },
});
