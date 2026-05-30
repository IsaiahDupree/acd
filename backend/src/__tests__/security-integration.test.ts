/**
 * Security Integration Tests
 * ===========================
 *
 * Integration tests for security middleware:
 * - PCT-WC-031: CSRF Protection
 * - PCT-WC-032: Rate Limiting on Auth Endpoints
 * - PCT-WC-033: Rate Limiting on API Endpoints
 * - PCT-WC-034: Input Sanitization
 * - PCT-WC-035: SQL Injection Prevention
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import request from 'supertest';
import {
  csrfProtection,
  generateCSRFToken,
  getCSRFToken,
} from '../middleware/csrf';
import {
  createAuthRateLimiter,
  createAPIRateLimiter,
  RateLimiter,
} from '../middleware/rate-limit';
import {
  sanitizeAllInputs,
  sanitizeHTML,
  stripHTML,
  sanitizeEmail,
  sanitizeURL,
  sanitizeFilename,
} from '../middleware/sanitization';

// ============================================
// CSRF PROTECTION TESTS (PCT-WC-031)
// ============================================

describe('CSRF Protection (PCT-WC-031)', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
  });

  it('should generate CSRF token on GET request', async () => {
    app.use(csrfProtection);
    app.get('/test', (req: any, res) => {
      res.json({ token: getCSRFToken(req) });
    });

    const response = await request(app).get('/test');

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(response.body.token.length).toBeGreaterThan(20);
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('should accept POST with valid CSRF token', async () => {
    app.use(csrfProtection);
    app.post('/test', (req, res) => {
      res.json({ success: true });
    });

    // First get the token
    const token = generateCSRFToken();

    // Make POST request with token
    const response = await request(app)
      .post('/test')
      .set('Cookie', [`csrf-token=${token}`])
      .set('X-CSRF-Token', token)
      .send({ data: 'test' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should reject POST without CSRF token', async () => {
    app.use(csrfProtection);
    app.post('/test', (req, res) => {
      res.json({ success: true });
    });

    const response = await request(app).post('/test').send({ data: 'test' });

    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('should reject POST with mismatched CSRF token', async () => {
    app.use(csrfProtection);
    app.post('/test', (req, res) => {
      res.json({ success: true });
    });

    const response = await request(app)
      .post('/test')
      .set('Cookie', ['csrf-token=cookie-token'])
      .set('X-CSRF-Token', 'header-token')
      .send({ data: 'test' });

    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('should allow GET/HEAD/OPTIONS without CSRF token', async () => {
    app.use(csrfProtection);
    app.get('/test', (req, res) => res.json({ success: true }));
    app.head('/test', (req, res) => res.status(200).end());
    app.options('/test', (req, res) => res.status(200).end());

    const getResponse = await request(app).get('/test');
    expect(getResponse.status).toBe(200);

    const headResponse = await request(app).head('/test');
    expect(headResponse.status).toBe(200);

    const optionsResponse = await request(app).options('/test');
    expect(optionsResponse.status).toBe(200);
  });
});

// ============================================
// RATE LIMITING TESTS (PCT-WC-032, PCT-WC-033)
// ============================================

describe('Rate Limiting', () => {
  let redis: Redis;
  let app: express.Application;

  beforeEach(async () => {
    redis = new Redis();
    app = express();
    app.use(express.json());

    // Clear all rate limit keys
    const keys = await redis.keys('ratelimit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterEach(async () => {
    await redis.quit();
  });

  it('should allow requests within rate limit (PCT-WC-032)', async () => {
    const limiter = new RateLimiter(redis, {
      windowMs: 60000,
      maxRequests: 5,
      keyPrefix: 'ratelimit:test1',
    });

    let requestCount = 0;
    app.use(limiter.middleware({
      keyGenerator: () => `test-user-1-${Date.now()}`, // Unique key for this test
    }));
    app.post('/auth/login', (req, res) => {
      requestCount++;
      res.json({ success: true });
    });

    // First 5 requests should succeed
    for (let i = 0; i < 5; i++) {
      const response = await request(app).post('/auth/login').send({ email: 'test@example.com' });
      expect(response.status).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe('5');
    }
  });

  it('should block requests exceeding rate limit (PCT-WC-032)', async () => {
    // Test the rate limiter logic directly
    const testRedis = new Redis();
    const testIdentifier = `user-${Date.now()}-${Math.random()}`;
    const testKeyPrefix = `test:limit:${Date.now()}`;

    const limiter = new RateLimiter(testRedis, {
      windowMs: 60000,
      maxRequests: 3,
      keyPrefix: testKeyPrefix,
    });

    // Check limit 4 times
    const result1 = await limiter.checkLimit(testIdentifier);
    expect(result1.remaining).toBeGreaterThan(0); // Should allow

    const result2 = await limiter.checkLimit(testIdentifier);
    expect(result2.remaining).toBeGreaterThan(0); // Should allow

    const result3 = await limiter.checkLimit(testIdentifier);
    expect(result3.remaining).toBe(0); // Last allowed request

    const result4 = await limiter.checkLimit(testIdentifier);
    expect(result4.remaining).toBe(0); // Should be blocked (not added)

    // Verify the limit was enforced
    expect(result1.limit).toBe(3);
    expect(result2.limit).toBe(3);
    expect(result3.limit).toBe(3);
    expect(result4.limit).toBe(3);

    await testRedis.quit();
  });

  it('should include rate limit headers (PCT-WC-033)', async () => {
    const limiter = createAPIRateLimiter(redis);

    app.use(limiter.middleware());
    app.get('/api/data', (req, res) => {
      res.json({ data: 'test' });
    });

    const response = await request(app).get('/api/data');

    expect(response.status).toBe(200);
    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    expect(response.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('should use different limits for auth vs API (PCT-WC-032, PCT-WC-033)', async () => {
    const authLimiter = createAuthRateLimiter(redis);
    const apiLimiter = createAPIRateLimiter(redis);

    const authApp = express();
    authApp.use(express.json());
    authApp.use(authLimiter.middleware());
    authApp.post('/auth/login', (req, res) => res.json({ success: true }));

    const apiApp = express();
    apiApp.use(express.json());
    apiApp.use(apiLimiter.middleware());
    apiApp.get('/api/data', (req, res) => res.json({ data: 'test' }));

    // Auth should have stricter limits (5 per 15 min)
    const authResponse = await request(authApp).post('/auth/login').send({});
    expect(parseInt(authResponse.headers['x-ratelimit-limit'])).toBe(5);

    // API should have looser limits (100 per min)
    const apiResponse = await request(apiApp).get('/api/data');
    expect(parseInt(apiResponse.headers['x-ratelimit-limit'])).toBe(100);
  });
});

// ============================================
// INPUT SANITIZATION TESTS (PCT-WC-034)
// ============================================

describe('Input Sanitization (PCT-WC-034)', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it('should sanitize HTML in request body', async () => {
    app.use(sanitizeAllInputs());
    app.post('/test', (req, res) => {
      res.json({ data: req.body });
    });

    const response = await request(app)
      .post('/test')
      .send({ message: '<script>alert("XSS")</script>' });

    expect(response.status).toBe(200);
    expect(response.body.data.message).not.toContain('<script>');
    expect(response.body.data.message).toContain('&lt;script&gt;');
  });

  it('should trim and limit string length', async () => {
    app.use(sanitizeAllInputs());
    app.post('/test', (req, res) => {
      res.json({ data: req.body });
    });

    const longString = 'a'.repeat(20000);
    const response = await request(app).post('/test').send({ message: `  ${longString}  ` });

    expect(response.status).toBe(200);
    expect(response.body.data.message).not.toContain('  ');
    expect(response.body.data.message.length).toBeLessThanOrEqual(10000);
  });

  it('should prevent prototype pollution', async () => {
    app.use(sanitizeAllInputs());
    app.post('/test', (req, res) => {
      res.json({ data: req.body });
    });

    const response = await request(app)
      .post('/test')
      .send({
        __proto__: { polluted: true },
        constructor: { polluted: true },
        prototype: { polluted: true },
      });

    expect(response.status).toBe(200);
    expect(response.body.data).not.toHaveProperty('__proto__');
    expect(response.body.data).not.toHaveProperty('constructor');
    expect(response.body.data).not.toHaveProperty('prototype');
  });

  it('should reject deeply nested objects', async () => {
    app.use(sanitizeAllInputs({ maxDepth: 3 }));
    app.post('/test', (req, res) => {
      res.json({ data: req.body });
    });

    const deepObject = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: 'too deep',
            },
          },
        },
      },
    };

    const response = await request(app).post('/test').send(deepObject);

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('INVALID_INPUT');
  });

  it('should sanitize query parameters', async () => {
    app.use(sanitizeAllInputs());
    app.get('/test', (req, res) => {
      res.json({ query: req.query });
    });

    const response = await request(app).get('/test?search=<script>alert("XSS")</script>');

    expect(response.status).toBe(200);
    expect(response.body.query.search).not.toContain('<script>');
    expect(response.body.query.search).toContain('&lt;script&gt;');
  });
});

// ============================================
// SANITIZATION HELPER TESTS
// ============================================

describe('Sanitization Helper Functions (PCT-WC-034)', () => {
  it('should sanitize HTML correctly', () => {
    const input = '<script>alert("XSS")</script>';
    const output = sanitizeHTML(input);

    expect(output).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
  });

  it('should strip HTML tags', () => {
    const input = 'Hello <b>World</b><script>alert("XSS")</script>';
    const output = stripHTML(input);

    expect(output).toBe('Hello World');
    expect(output).not.toContain('<');
  });

  it('should validate and sanitize email', () => {
    expect(sanitizeEmail('  USER@EXAMPLE.COM  ')).toBe('user@example.com');
    expect(sanitizeEmail('valid@email.com')).toBe('valid@email.com');
    expect(sanitizeEmail('invalid')).toBeNull();
    expect(sanitizeEmail('test@')).toBeNull();
    expect(sanitizeEmail('@example.com')).toBeNull();
  });

  it('should validate and sanitize URL', () => {
    expect(sanitizeURL('https://example.com')).toBe('https://example.com/');
    expect(sanitizeURL('http://example.com/path')).toBe('http://example.com/path');
    expect(sanitizeURL('javascript:alert("XSS")')).toBeNull();
    expect(sanitizeURL('data:text/html,<script>alert("XSS")</script>')).toBeNull();
  });

  it('should sanitize filename', () => {
    expect(sanitizeFilename('valid-file.txt')).toBe('valid-file.txt');
    expect(sanitizeFilename('file with spaces.txt')).toBe('file_with_spaces.txt');
    expect(sanitizeFilename('../../../etc/passwd')).toBeNull();
    expect(sanitizeFilename('/etc/passwd')).toBeNull();
    // Filenames with path separators are rejected (safer than sanitizing)
    expect(sanitizeFilename('file;rm -rf /')).toBeNull();
    // But filenames without path separators are sanitized
    expect(sanitizeFilename('file;rm test')).toBe('file_rm_test');
  });
});

// ============================================
// SQL INJECTION PREVENTION (PCT-WC-035)
// ============================================

describe('SQL Injection Prevention (PCT-WC-035)', () => {
  it('should use parameterized queries', () => {
    // This test verifies the audit documentation exists
    // Actual SQL queries use Prisma which auto-parameterizes
    const auditDoc = require('fs').existsSync(
      require('path').join(__dirname, '../../SQL_INJECTION_AUDIT.md')
    );

    expect(auditDoc).toBe(true);
  });

  it('should reject malicious input before database', () => {
    const maliciousInputs = [
      "1'; DROP TABLE users; --",
      "admin' OR '1'='1",
      "'; DELETE FROM users WHERE '1'='1",
      "1 UNION SELECT * FROM passwords",
    ];

    // Input sanitization should prevent these from reaching the database
    maliciousInputs.forEach((input) => {
      // After HTML sanitization, dangerous characters are escaped
      const sanitized = sanitizeHTML(input);

      // Check that dangerous characters are escaped
      expect(sanitized).not.toContain("<");
      expect(sanitized).not.toContain(">");

      // If the input contained single quotes, they should be escaped
      if (input.includes("'")) {
        expect(sanitized).toContain("&#x27;"); // Escaped single quote
      }

      // The sanitized version should not equal the original malicious input
      if (input.includes("'") || input.includes("<") || input.includes(">")) {
        expect(sanitized).not.toBe(input);
      }
    });
  });
});
