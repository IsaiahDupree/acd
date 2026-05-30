/**
 * Static Asset Caching Middleware
 * ================================
 *
 * Implements aggressive caching for static assets with:
 * - Long-term browser caching (1 year for immutable assets)
 * - CDN-friendly cache headers
 * - Content-based hashing (fingerprinting)
 * - Conditional requests (ETag, Last-Modified)
 * - Cache busting strategies
 *
 * Feature: PCT-WC-054
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Cache configuration by file type
 */
const CACHE_POLICIES: Record<string, { maxAge: number; immutable?: boolean; extensions: string[] }> = {
  // Immutable assets (versioned/hashed filenames) - cache for 1 year
  immutable: {
    maxAge: 31536000, // 1 year in seconds
    immutable: true,
    extensions: ['.woff2', '.woff', '.ttf', '.eot'],
  },

  // Long-term cacheable (images, fonts) - cache for 30 days
  longTerm: {
    maxAge: 2592000, // 30 days in seconds
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico'],
  },

  // Medium-term cacheable (CSS, JS) - cache for 7 days
  mediumTerm: {
    maxAge: 604800, // 7 days in seconds
    extensions: ['.css', '.js', '.json'],
  },

  // Short-term cacheable (HTML) - cache for 1 hour
  shortTerm: {
    maxAge: 3600, // 1 hour in seconds
    extensions: ['.html', '.htm'],
  },

  // No cache (dynamic content)
  noCache: {
    maxAge: 0,
    extensions: [],
  },
};

/**
 * Generate ETag for file content
 */
function generateETag(content: Buffer | string): string {
  const hash = crypto.createHash('md5');
  hash.update(content);
  return `"${hash.digest('hex')}"`;
}

/**
 * Check if request is conditional and can use cached version
 */
function isNotModified(req: Request, etag: string, mtime?: Date): boolean {
  // Check If-None-Match (ETag)
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch === etag) {
    return true;
  }

  // Check If-Modified-Since (Last-Modified)
  const ifModifiedSince = req.headers['if-modified-since'];
  if (ifModifiedSince && mtime) {
    const modifiedTime = new Date(ifModifiedSince);
    if (mtime <= modifiedTime) {
      return true;
    }
  }

  return false;
}

/**
 * Get cache policy for a file based on extension
 */
function getCachePolicy(filePath: string): { maxAge: number; immutable?: boolean } | null {
  const ext = path.extname(filePath).toLowerCase();

  // Check if filename contains hash (e.g., app.abc123.js)
  const hasHash = /\.[a-f0-9]{8,}\.(js|css|png|jpg|webp)$/i.test(filePath);
  if (hasHash) {
    return CACHE_POLICIES.immutable;
  }

  // Find matching policy by extension
  for (const [name, policy] of Object.entries(CACHE_POLICIES)) {
    if (policy.extensions.includes(ext)) {
      return { maxAge: policy.maxAge, immutable: policy.immutable };
    }
  }

  return null;
}

/**
 * Build Cache-Control header value
 */
function buildCacheControl(policy: { maxAge: number; immutable?: boolean }): string {
  const directives: string[] = [];

  if (policy.maxAge === 0) {
    directives.push('no-cache', 'no-store', 'must-revalidate');
  } else {
    directives.push('public');
    directives.push(`max-age=${policy.maxAge}`);

    if (policy.immutable) {
      directives.push('immutable');
    }
  }

  return directives.join(', ');
}

/**
 * Static asset caching middleware
 */
export function staticCacheMiddleware(options: {
  root: string;
  customPolicies?: Record<string, { maxAge: number; immutable?: boolean }>;
} = { root: '.' }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Get file path
    const filePath = path.join(options.root, req.path);

    // Check if file exists
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return next();
    }

    try {
      // Get file stats
      const stats = fs.statSync(filePath);
      const mtime = stats.mtime;

      // Read file content
      const content = fs.readFileSync(filePath);

      // Generate ETag
      const etag = generateETag(content);

      // Check if client has cached version
      if (isNotModified(req, etag, mtime)) {
        res.status(304);
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', mtime.toUTCString());
        return res.end();
      }

      // Get cache policy
      const policy = getCachePolicy(filePath);

      if (policy) {
        // Set cache headers
        res.setHeader('Cache-Control', buildCacheControl(policy));
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', mtime.toUTCString());

        // Set Vary header for CDN caching
        res.setHeader('Vary', 'Accept-Encoding');

        // Set CDN-specific headers
        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('CDN-Cache-Control', `max-age=${policy.maxAge}`);

        // Set CORS headers for fonts and assets
        const ext = path.extname(filePath).toLowerCase();
        if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext)) {
          res.setHeader('Access-Control-Allow-Origin', '*');
        }
      }

      // Set content type
      const contentType = getContentType(filePath);
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      // Send file
      res.send(content);
    } catch (error) {
      console.error('Static cache middleware error:', error);
      next();
    }
  };
}

/**
 * Get content type for file extension
 */
function getContentType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();

  const types: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.ico': 'image/x-icon',
  };

  return types[ext] || null;
}

/**
 * Cache busting utility - add hash to filename
 */
export function addCacheBuster(filePath: string): string {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);

  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);
  const dirname = path.dirname(filePath);

  return path.join(dirname, `${basename}.${hash}${ext}`);
}

/**
 * Express static options with caching
 */
export function getStaticOptions(maxAge: number = 86400) {
  return {
    maxAge: maxAge * 1000, // Convert to milliseconds
    immutable: true,
    etag: true,
    lastModified: true,
    setHeaders: (res: Response, filePath: string) => {
      const policy = getCachePolicy(filePath);

      if (policy) {
        res.setHeader('Cache-Control', buildCacheControl(policy));
      }

      // Set Vary header
      res.setHeader('Vary', 'Accept-Encoding');

      // Font CORS
      const ext = path.extname(filePath).toLowerCase();
      if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext.toLowerCase())) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    },
  };
}

/**
 * Preload link header generator for critical assets
 */
export function generatePreloadHeaders(assets: Array<{ path: string; type: 'script' | 'style' | 'font' | 'image' }>): string {
  return assets
    .map((asset) => {
      const crossorigin = asset.type === 'font' ? '; crossorigin' : '';
      return `<${asset.path}>; rel=preload; as=${asset.type}${crossorigin}`;
    })
    .join(', ');
}

/**
 * CDN purge utility (for when you need to invalidate cache)
 */
export async function purgeCDNCache(urls: string[]): Promise<void> {
  // This would integrate with your CDN provider (CloudFlare, Fastly, etc.)
  // Example for CloudFlare:
  /*
  const response = await fetch('https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache', {
    method: 'POST',
    headers: {
      'X-Auth-Email': process.env.CF_EMAIL,
      'X-Auth-Key': process.env.CF_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: urls }),
  });
  */

  console.log(`[CDN] Would purge ${urls.length} URLs:`, urls);
}

/**
 * Example usage:
 *
 * // In Express app
 * import express from 'express';
 * import { staticCacheMiddleware, getStaticOptions } from './middleware/static-cache';
 *
 * const app = express();
 *
 * // Option 1: Use custom middleware
 * app.use(staticCacheMiddleware({ root: './public' }));
 *
 * // Option 2: Use with express.static
 * app.use('/static', express.static('public', getStaticOptions(86400)));
 *
 * // Preload critical assets
 * app.get('/', (req, res) => {
 *   const preloadLinks = generatePreloadHeaders([
 *     { path: '/css/main.css', type: 'style' },
 *     { path: '/js/app.js', type: 'script' },
 *     { path: '/fonts/inter.woff2', type: 'font' },
 *   ]);
 *
 *   res.setHeader('Link', preloadLinks);
 *   res.sendFile('index.html');
 * });
 */
