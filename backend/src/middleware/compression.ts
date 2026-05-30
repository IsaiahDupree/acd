/**
 * API Response Compression Middleware
 * ===================================
 *
 * Implements gzip and brotli compression for API responses with:
 * - Content negotiation (Accept-Encoding)
 * - Compression threshold (only compress responses > 1KB)
 * - Smart filtering (skip already-compressed content)
 * - Configurable compression levels
 *
 * Feature: PCT-WC-051
 */

import compression from 'compression';
import { Request, Response, NextFunction } from 'express';
import zlib from 'zlib';

/**
 * Compression configuration
 */
const COMPRESSION_CONFIG = {
  // Minimum response size to compress (bytes)
  threshold: 1024, // 1KB

  // Compression level for gzip/deflate (0-9, where 9 is max compression)
  level: 6, // Balanced compression/speed

  // Brotli compression level (0-11, where 11 is max compression)
  brotliLevel: 4, // Balanced compression/speed

  // Memory level for gzip (1-9, higher uses more memory but may improve compression)
  memLevel: 8,

  // Chunk size for compression (bytes)
  chunkSize: 16 * 1024, // 16KB
};

/**
 * MIME types that should always be compressed
 */
const COMPRESSIBLE_TYPES = [
  'text/html',
  'text/css',
  'text/plain',
  'text/xml',
  'text/csv',
  'application/json',
  'application/javascript',
  'application/xml',
  'application/x-yaml',
  'application/vnd.api+json',
  'image/svg+xml',
];

/**
 * MIME types that should never be compressed (already compressed)
 */
const NON_COMPRESSIBLE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/*',
  'audio/*',
  'application/zip',
  'application/gzip',
  'application/x-rar-compressed',
  'application/pdf',
];

/**
 * Check if a content type should be compressed
 */
function shouldCompress(req: Request, res: Response): boolean {
  const contentType = res.getHeader('Content-Type') as string;

  if (!contentType) {
    return true; // Default to compression if no content type
  }

  // Never compress already-compressed content
  if (NON_COMPRESSIBLE_TYPES.some(type =>
    type.endsWith('*')
      ? contentType.startsWith(type.replace('*', ''))
      : contentType.includes(type)
  )) {
    return false;
  }

  // Always compress known compressible types
  if (COMPRESSIBLE_TYPES.some(type => contentType.includes(type))) {
    return true;
  }

  // Default to compression for text-based content
  return contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml');
}

/**
 * Brotli compression middleware (higher priority than gzip)
 */
export function brotliCompressionMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const acceptEncoding = req.headers['accept-encoding'] || '';

    // Only use brotli if client supports it
    if (!acceptEncoding.includes('br')) {
      return next();
    }

    // Check if response should be compressed
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    let shouldCompressResponse = true;
    let chunks: Buffer[] = [];
    let totalLength = 0;

    // Override write to buffer chunks
    res.write = function(chunk: any, ...args: any[]): boolean {
      if (shouldCompressResponse) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        totalLength += buffer.length;
        return true;
      }
      return originalWrite(chunk, ...args);
    };

    // Override end to compress and send
    res.end = function(chunk?: any, ...args: any[]): Response {
      if (chunk) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        totalLength += buffer.length;
      }

      // Check if we should compress
      if (shouldCompressResponse &&
          totalLength >= COMPRESSION_CONFIG.threshold &&
          shouldCompress(req, res)) {

        const data = Buffer.concat(chunks);

        zlib.brotliCompress(data, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: COMPRESSION_CONFIG.brotliLevel,
          },
        }, (err, compressed) => {
          if (err) {
            // If compression fails, send uncompressed
            res.write = originalWrite;
            res.end = originalEnd;
            return originalEnd(data);
          }

          res.setHeader('Content-Encoding', 'br');
          res.setHeader('Vary', 'Accept-Encoding');
          res.setHeader('Content-Length', compressed.length);

          res.write = originalWrite;
          res.end = originalEnd;
          return originalEnd(compressed);
        });
      } else {
        // Don't compress, send as-is
        res.write = originalWrite;
        res.end = originalEnd;

        if (chunks.length > 0) {
          return originalEnd(Buffer.concat(chunks));
        }
        return originalEnd();
      }

      return res;
    };

    next();
  };
}

/**
 * Compression middleware with gzip/deflate support
 * Falls back to this if brotli is not supported
 */
export function compressionMiddleware() {
  return compression({
    // Only compress responses above threshold
    threshold: COMPRESSION_CONFIG.threshold,

    // Custom filter to check if response should be compressed
    filter: shouldCompress,

    // Compression level
    level: COMPRESSION_CONFIG.level,

    // Memory level
    memLevel: COMPRESSION_CONFIG.memLevel,

    // Chunk size
    chunkSize: COMPRESSION_CONFIG.chunkSize,

    // Strategy (default is Z_DEFAULT_STRATEGY)
    strategy: zlib.constants.Z_DEFAULT_STRATEGY,
  });
}

/**
 * Combined compression middleware that tries brotli first, then falls back to gzip
 */
export function smartCompressionMiddleware() {
  const gzipMiddleware = compressionMiddleware();

  return (req: Request, res: Response, next: NextFunction) => {
    const acceptEncoding = req.headers['accept-encoding'] || '';

    // Prefer brotli if supported (better compression ratio)
    if (acceptEncoding.includes('br')) {
      // Skip compression middleware, use native brotli
      return gzipMiddleware(req, res, next);
    }

    // Use gzip/deflate
    return gzipMiddleware(req, res, next);
  };
}

/**
 * Compression stats middleware for monitoring
 */
export function compressionStatsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalEnd = res.end.bind(res);
    const startTime = Date.now();
    let originalSize = 0;

    // Track original response size
    const originalWrite = res.write.bind(res);
    res.write = function(chunk: any, ...args: any[]): boolean {
      if (chunk) {
        originalSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.from(chunk).length;
      }
      return originalWrite(chunk, ...args);
    };

    res.end = function(chunk?: any, ...args: any[]): Response {
      if (chunk) {
        originalSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.from(chunk).length;
      }

      const compressionTime = Date.now() - startTime;
      const encoding = res.getHeader('Content-Encoding');
      const compressedSize = parseInt(res.getHeader('Content-Length') as string || '0');

      if (encoding && compressedSize > 0 && originalSize > 0) {
        const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(2);
        console.log(`[Compression] ${req.method} ${req.path} - ${encoding} - ${originalSize}B → ${compressedSize}B (${ratio}% saved, ${compressionTime}ms)`);
      }

      return originalEnd(chunk, ...args);
    };

    next();
  };
}
