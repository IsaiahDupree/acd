/**
 * Static Asset Caching Tests
 * ===========================
 *
 * Tests for PCT-WC-054: Static asset caching with CDN
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { staticCacheMiddleware, getStaticOptions, generatePreloadHeaders, addCacheBuster } from '../middleware/static-cache';
import * as fs from 'fs';
import * as path from 'path';

describe('Static Asset Caching (PCT-WC-054)', () => {
  let app: Express;
  const testRoot = path.join(__dirname, '../../test-static');

  beforeEach(async () => {
    app = express();

    // Create test directory and files
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }

    // Create test files
    fs.writeFileSync(path.join(testRoot, 'test.css'), 'body { margin: 0; }');
    fs.writeFileSync(path.join(testRoot, 'test.js'), 'console.log("test");');
    fs.writeFileSync(path.join(testRoot, 'test.html'), '<html><body>Test</body></html>');
    fs.writeFileSync(path.join(testRoot, 'test.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(testRoot, 'test.abc12345.js'), 'console.log("hashed");');
  });

  describe('Cache headers', () => {
    beforeEach(() => {
      app.use(staticCacheMiddleware({ root: testRoot }));
    });

    it('should set long-term cache headers for images', async () => {
      const response = await request(app).get('/test.png').expect(200);

      expect(response.headers['cache-control']).toBeDefined();
      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('max-age=2592000'); // 30 days
    });

    it('should set medium-term cache headers for CSS', async () => {
      const response = await request(app).get('/test.css').expect(200);

      expect(response.headers['cache-control']).toBeDefined();
      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('max-age=604800'); // 7 days
    });

    it('should set medium-term cache headers for JavaScript', async () => {
      const response = await request(app).get('/test.js').expect(200);

      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('max-age=604800'); // 7 days
    });

    it('should set short-term cache headers for HTML', async () => {
      const response = await request(app).get('/test.html').expect(200);

      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('max-age=3600'); // 1 hour
    });

    it('should set immutable cache for hashed filenames', async () => {
      const response = await request(app).get('/test.abc12345.js').expect(200);

      expect(response.headers['cache-control']).toContain('immutable');
      expect(response.headers['cache-control']).toContain('max-age=31536000'); // 1 year
    });
  });

  describe('ETag support', () => {
    beforeEach(() => {
      app.use(staticCacheMiddleware({ root: testRoot }));
    });

    it('should generate ETag header', async () => {
      const response = await request(app).get('/test.css').expect(200);

      expect(response.headers['etag']).toBeDefined();
      expect(response.headers['etag']).toMatch(/^"[a-f0-9]{32}"$/);
    });

    it('should return 304 Not Modified when ETag matches', async () => {
      // First request to get ETag
      const firstResponse = await request(app).get('/test.css').expect(200);

      const etag = firstResponse.headers['etag'];

      // Second request with If-None-Match
      const secondResponse = await request(app)
        .get('/test.css')
        .set('If-None-Match', etag)
        .expect(304);

      expect(secondResponse.body).toEqual({});
    });

    it('should set Last-Modified header', async () => {
      const response = await request(app).get('/test.js').expect(200);

      expect(response.headers['last-modified']).toBeDefined();
    });

    it('should return 304 when If-Modified-Since is current', async () => {
      // First request to get Last-Modified
      const firstResponse = await request(app).get('/test.js').expect(200);

      const lastModified = firstResponse.headers['last-modified'];

      // Second request with If-Modified-Since
      const secondResponse = await request(app)
        .get('/test.js')
        .set('If-Modified-Since', lastModified)
        .expect(304);

      expect(secondResponse.body).toEqual({});
    });
  });

  describe('CDN headers', () => {
    beforeEach(() => {
      app.use(staticCacheMiddleware({ root: testRoot }));
    });

    it('should set Vary header for CDN', async () => {
      const response = await request(app).get('/test.css').expect(200);

      expect(response.headers['vary']).toContain('Accept-Encoding');
    });

    it('should set CDN-Cache-Control header', async () => {
      const response = await request(app).get('/test.js').expect(200);

      expect(response.headers['cdn-cache-control']).toBeDefined();
    });

    it('should set X-Cache-Status header', async () => {
      const response = await request(app).get('/test.png').expect(200);

      expect(response.headers['x-cache-status']).toBe('HIT');
    });
  });

  describe('Content-Type headers', () => {
    beforeEach(() => {
      app.use(staticCacheMiddleware({ root: testRoot }));
    });

    it('should set correct content type for CSS', async () => {
      const response = await request(app).get('/test.css').expect(200);

      expect(response.headers['content-type']).toContain('text/css');
    });

    it('should set correct content type for JavaScript', async () => {
      const response = await request(app).get('/test.js').expect(200);

      expect(response.headers['content-type']).toContain('application/javascript');
    });

    it('should set correct content type for HTML', async () => {
      const response = await request(app).get('/test.html').expect(200);

      expect(response.headers['content-type']).toContain('text/html');
    });

    it('should set correct content type for PNG', async () => {
      const response = await request(app).get('/test.png').expect(200);

      expect(response.headers['content-type']).toContain('image/png');
    });
  });

  describe('generatePreloadHeaders', () => {
    it('should generate preload header for styles', () => {
      const header = generatePreloadHeaders([{ path: '/css/main.css', type: 'style' }]);

      expect(header).toBe('</css/main.css>; rel=preload; as=style');
    });

    it('should generate preload header for scripts', () => {
      const header = generatePreloadHeaders([{ path: '/js/app.js', type: 'script' }]);

      expect(header).toBe('</js/app.js>; rel=preload; as=script');
    });

    it('should generate preload header for fonts with crossorigin', () => {
      const header = generatePreloadHeaders([{ path: '/fonts/inter.woff2', type: 'font' }]);

      expect(header).toBe('</fonts/inter.woff2>; rel=preload; as=font; crossorigin');
    });

    it('should generate multiple preload headers', () => {
      const header = generatePreloadHeaders([
        { path: '/css/main.css', type: 'style' },
        { path: '/js/app.js', type: 'script' },
      ]);

      expect(header).toContain('</css/main.css>; rel=preload; as=style');
      expect(header).toContain('</js/app.js>; rel=preload; as=script');
    });
  });

  describe('getStaticOptions', () => {
    it('should return valid express.static options', () => {
      const options = getStaticOptions(86400);

      expect(options.maxAge).toBe(86400000); // milliseconds
      expect(options.immutable).toBe(true);
      expect(options.etag).toBe(true);
      expect(options.lastModified).toBe(true);
      expect(options.setHeaders).toBeTypeOf('function');
    });

    it('should use default maxAge if not provided', () => {
      const options = getStaticOptions();

      expect(options.maxAge).toBe(86400000); // 1 day default
    });
  });

  describe('addCacheBuster', () => {
    it('should add hash to filename', () => {
      const testFile = path.join(testRoot, 'test.css');
      const busted = addCacheBuster(testFile);

      // Should have format: test.<hash>.css
      expect(busted).toMatch(/test\.[a-f0-9]{8}\.css$/);
    });

    it('should generate consistent hash for same content', () => {
      const testFile = path.join(testRoot, 'test.js');

      const busted1 = addCacheBuster(testFile);
      const busted2 = addCacheBuster(testFile);

      expect(busted1).toBe(busted2);
    });

    it('should preserve directory path', () => {
      const testFile = path.join(testRoot, 'test.png');
      const busted = addCacheBuster(testFile);

      expect(busted).toContain(testRoot);
    });
  });
});
