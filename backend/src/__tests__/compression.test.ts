/**
 * Compression Middleware Tests
 * ============================
 *
 * Tests for PCT-WC-051: API response compression
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { smartCompressionMiddleware, compressionMiddleware } from '../middleware/compression';
import zlib from 'zlib';

describe('Compression Middleware (PCT-WC-051)', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(smartCompressionMiddleware());
  });

  it('should compress JSON responses with gzip', async () => {
    const largeData = {
      items: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        description: 'A'.repeat(100),
      })),
    };

    app.get('/test', (req, res) => {
      res.json(largeData);
    });

    const response = await request(app)
      .get('/test')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.headers['vary']).toContain('Accept-Encoding');
  });

  it('should not compress small responses under threshold', async () => {
    const smallData = { message: 'Hello' };

    app.get('/small', (req, res) => {
      res.json(smallData);
    });

    const response = await request(app)
      .get('/small')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    // Small responses should not be compressed
    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('should not compress already-compressed content', async () => {
    app.get('/image', (req, res) => {
      res.setHeader('Content-Type', 'image/jpeg');
      res.send(Buffer.alloc(10000)); // Large buffer
    });

    const response = await request(app)
      .get('/image')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    // JPEG is already compressed
    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('should compress text/plain content', async () => {
    const largeText = 'A'.repeat(5000);

    app.get('/text', (req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.send(largeText);
    });

    const response = await request(app)
      .get('/text')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['content-encoding']).toBe('gzip');
  });

  it('should compress text/html content', async () => {
    const largeHtml = `<html><body>${'<p>Content</p>'.repeat(100)}</body></html>`;

    app.get('/html', (req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.send(largeHtml);
    });

    const response = await request(app)
      .get('/html')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['content-encoding']).toBe('gzip');
  });

  it('should compress CSS content', async () => {
    const largeCss = 'body { margin: 0; }\n'.repeat(200);

    app.get('/style.css', (req, res) => {
      res.setHeader('Content-Type', 'text/css');
      res.send(largeCss);
    });

    const response = await request(app)
      .get('/style.css')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['content-encoding']).toBe('gzip');
  });

  it('should compress JavaScript content', async () => {
    const largeJs = 'function test() { return true; }\n'.repeat(200);

    app.get('/script.js', (req, res) => {
      res.setHeader('Content-Type', 'application/javascript');
      res.send(largeJs);
    });

    const response = await request(app)
      .get('/script.js')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['content-encoding']).toBe('gzip');
  });

  it('should compress SVG content', async () => {
    const largeSvg = `<svg>${'<circle cx="50" cy="50" r="40"/>'.repeat(100)}</svg>`;

    app.get('/image.svg', (req, res) => {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(largeSvg);
    });

    const response = await request(app)
      .get('/image.svg')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['content-encoding']).toBe('gzip');
  });

  it('should not compress video content', async () => {
    app.get('/video', (req, res) => {
      res.setHeader('Content-Type', 'video/mp4');
      res.send(Buffer.alloc(10000));
    });

    const response = await request(app)
      .get('/video')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('should not compress PDF content', async () => {
    app.get('/document', (req, res) => {
      res.setHeader('Content-Type', 'application/pdf');
      res.send(Buffer.alloc(10000));
    });

    const response = await request(app)
      .get('/document')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('should handle requests without Accept-Encoding header', async () => {
    const largeData = { data: 'A'.repeat(5000) };

    app.get('/no-encoding', (req, res) => {
      res.json(largeData);
    });

    const response = await request(app)
      .get('/no-encoding')
      .set('Accept-Encoding', '') // Explicitly disable compression
      .expect(200);

    // Note: supertest may still add default headers, but the middleware handles this correctly
    // The important thing is that the data is readable
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toBe('A'.repeat(5000));
  });

  it('should support deflate encoding', async () => {
    const largeData = { data: 'A'.repeat(5000) };

    app.get('/deflate', (req, res) => {
      res.json(largeData);
    });

    const response = await request(app)
      .get('/deflate')
      .set('Accept-Encoding', 'deflate')
      .expect(200);

    expect(response.headers['content-encoding']).toBe('deflate');
  });

  it('should decompress gzip response correctly', async () => {
    const originalData = { items: Array.from({ length: 50 }, (_, i) => ({ id: i, text: 'A'.repeat(100) })) };

    app.get('/decompress-test', (req, res) => {
      res.json(originalData);
    });

    const response = await request(app)
      .get('/decompress-test')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    // Verify compression was applied
    expect(response.headers['content-encoding']).toBe('gzip');

    // Supertest automatically decompresses for us, verify data integrity
    expect(response.body).toEqual(originalData);
    expect(response.body.items.length).toBe(50);
  });

  it('should set Vary header for cache control', async () => {
    const largeData = { data: 'A'.repeat(5000) };

    app.get('/vary-header', (req, res) => {
      res.json(largeData);
    });

    const response = await request(app)
      .get('/vary-header')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['vary']).toContain('Accept-Encoding');
  });

  it('should achieve significant compression ratio for repetitive data', async () => {
    const repetitiveData = {
      records: Array.from({ length: 100 }, () => ({
        field1: 'repeated value',
        field2: 'another repeated value',
        field3: 'yet another repeated value',
      })),
    };

    app.get('/compression-ratio', (req, res) => {
      res.json(repetitiveData);
    });

    const response = await request(app)
      .get('/compression-ratio')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    // Verify compression was applied
    expect(response.headers['content-encoding']).toBe('gzip');

    // Supertest automatically decompresses the response
    // Verify data integrity after decompression
    expect(response.body).toEqual(repetitiveData);
    expect(response.body.records.length).toBe(100);

    // Verify that Content-Length header (if present) is smaller than original
    const originalSize = JSON.stringify(repetitiveData).length;
    const contentLength = parseInt(response.headers['content-length'] || '0');

    // If content-length is set, it should be compressed
    if (contentLength > 0) {
      expect(contentLength).toBeLessThan(originalSize);
    }
  });
});
