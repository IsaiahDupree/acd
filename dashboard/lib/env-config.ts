/**
 * Environment Variable Management (CF-WC-102)
 *
 * Structured environment configuration with validation and type safety.
 * Provides runtime validation and helpful error messages.
 */

import { z } from 'zod';

// Define environment variable schema
const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // API Configuration
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3434'),
  API_SECRET_KEY: z.string().min(32).optional(),

  // Database
  DATABASE_URL: z.string().url().optional(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),

  // Remotion API
  REMOTION_API_URL: z.string().url().optional(),
  REMOTION_API_KEY: z.string().min(16).optional(),

  // TikTok API
  TIKTOK_CLIENT_KEY: z.string().min(16).optional(),
  TIKTOK_CLIENT_SECRET: z.string().min(16).optional(),

  // AI Services
  OPENAI_API_KEY: z.string().startsWith('sk-').optional(),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),

  // Error Monitoring
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),

  // Feature Flags
  NEXT_PUBLIC_FEATURE_FLAGS_URL: z.string().url().optional(),
  FEATURE_FLAGS_API_KEY: z.string().optional(),

  // Authentication
  JWT_SECRET: z.string().min(32).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  AUTH_COOKIE_NAME: z.string().default('cf_session'),

  // File Storage
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Redis (for caching/sessions)
  REDIS_URL: z.string().url().optional(),

  // Email (for notifications)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

// Validate and parse environment variables
function validateEnv(): EnvConfig {
  try {
    const parsed = envSchema.parse(process.env);
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('Environment validation failed');
    }
    throw error;
  }
}

// Export validated config
export const env = validateEnv();

// Utility to check if required env vars are set for a feature
export function checkFeatureEnv(feature: string, requiredVars: (keyof EnvConfig)[]): boolean {
  const missing = requiredVars.filter((key) => !env[key]);

  if (missing.length > 0) {
    console.warn(`⚠️  Feature "${feature}" requires missing env vars: ${missing.join(', ')}`);
    return false;
  }

  return true;
}

// Utility to get public env vars for client-side
export function getPublicEnv() {
  return {
    API_URL: env.NEXT_PUBLIC_API_URL,
    FEATURE_FLAGS_URL: env.NEXT_PUBLIC_FEATURE_FLAGS_URL,
    NODE_ENV: env.NODE_ENV,
  };
}

// Utility to mask sensitive values in logs
export function maskSensitiveEnv(key: string, value: string): string {
  const sensitiveKeys = [
    'SECRET',
    'PASSWORD',
    'KEY',
    'TOKEN',
    'DSN',
  ];

  if (sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))) {
    if (value.length <= 8) return '***';
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  return value;
}

// Example .env.example file content
export const envExample = `# Content Factory Environment Variables

# Node Environment
NODE_ENV=development

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3434
API_SECRET_KEY=your-secret-key-min-32-chars-long

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/content_factory
DATABASE_POOL_SIZE=10

# Remotion API
REMOTION_API_URL=https://api.remotion.dev
REMOTION_API_KEY=your-remotion-api-key

# TikTok API (optional)
TIKTOK_CLIENT_KEY=your-tiktok-client-key
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret

# AI Services (optional)
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Error Monitoring (optional)
SENTRY_DSN=https://your-sentry-dsn
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project

# Feature Flags (optional)
NEXT_PUBLIC_FEATURE_FLAGS_URL=https://flags.example.com
FEATURE_FLAGS_API_KEY=your-flags-api-key

# Authentication
JWT_SECRET=your-jwt-secret-min-32-chars-long
SESSION_SECRET=your-session-secret-min-32-chars-long
AUTH_COOKIE_NAME=cf_session

# File Storage (optional)
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# CORS
CORS_ORIGIN=*

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-email-password
`;

// Runtime environment checker
export function checkEnvironment() {
  console.log('🔍 Checking environment configuration...\n');

  const requiredForDev = ['DATABASE_URL', 'JWT_SECRET', 'SESSION_SECRET'];
  const requiredForProd = [
    ...requiredForDev,
    'REMOTION_API_URL',
    'REMOTION_API_KEY',
    'SENTRY_DSN',
  ];

  const required = env.NODE_ENV === 'production' ? requiredForProd : requiredForDev;
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach((key) => console.error(`  - ${key}`));
    return false;
  }

  console.log('✅ All required environment variables are set\n');

  // Check optional features
  console.log('📦 Optional features:');
  console.log(`  TikTok API: ${checkFeatureEnv('TikTok', ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET']) ? '✅' : '⚠️  Not configured'}`);
  console.log(`  OpenAI: ${env.OPENAI_API_KEY ? '✅' : '⚠️  Not configured'}`);
  console.log(`  Sentry: ${env.SENTRY_DSN ? '✅' : '⚠️  Not configured'}`);
  console.log(`  S3 Storage: ${checkFeatureEnv('S3', ['S3_BUCKET', 'S3_ACCESS_KEY_ID']) ? '✅' : '⚠️  Not configured'}`);
  console.log(`  Redis: ${env.REDIS_URL ? '✅' : '⚠️  Not configured'}\n`);

  return true;
}
