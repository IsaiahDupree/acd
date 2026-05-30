/**
 * CSRF Protection Middleware
 * ===========================
 *
 * Implements Cross-Site Request Forgery protection for POST/PUT/DELETE requests.
 * Uses double-submit cookie pattern with secure, httpOnly cookies.
 *
 * Feature: PCT-WC-031
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ============================================
// TYPES
// ============================================

export interface CSRFRequest extends Request {
  csrfToken?: string;
}

// ============================================
// TOKEN GENERATION
// ============================================

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Initialize CSRF protection - generates token and sets cookie
 * Use this on GET requests to issue tokens
 */
export function initCSRF(req: CSRFRequest, res: Response, next: NextFunction) {
  // Skip if token already exists
  if (req.cookies?.['csrf-token']) {
    req.csrfToken = req.cookies['csrf-token'];
    return next();
  }

  // Generate new token
  const token = generateCSRFToken();
  req.csrfToken = token;

  // Set cookie with secure flags
  res.cookie('csrf-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  next();
}

/**
 * Verify CSRF token on mutating requests (POST/PUT/DELETE)
 * Expects token in X-CSRF-Token header
 */
export function verifyCSRF(req: CSRFRequest, res: Response, next: NextFunction) {
  // Skip for GET/HEAD/OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.['csrf-token'];
  const headerToken = req.headers['x-csrf-token'] as string;

  // Check if both tokens exist
  if (!cookieToken) {
    return res.status(403).json({
      error: {
        code: 'CSRF_TOKEN_MISSING',
        message: 'CSRF cookie not found. Please refresh the page.',
      },
    });
  }

  if (!headerToken) {
    return res.status(403).json({
      error: {
        code: 'CSRF_TOKEN_MISSING',
        message: 'CSRF token required in X-CSRF-Token header',
      },
    });
  }

  // Verify tokens match (constant-time comparison to prevent timing attacks)
  if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return res.status(403).json({
      error: {
        code: 'CSRF_TOKEN_INVALID',
        message: 'CSRF token validation failed',
      },
    });
  }

  next();
}

/**
 * Combined middleware for CSRF protection
 * Initializes token on first use and verifies on mutations
 */
export function csrfProtection(req: CSRFRequest, res: Response, next: NextFunction) {
  initCSRF(req, res, (err?: any) => {
    if (err) return next(err);
    verifyCSRF(req, res, next);
  });
}

// ============================================
// HELPER TO GET TOKEN FOR CLIENT
// ============================================

/**
 * Get the current CSRF token from request
 * Useful for sending token to client in response
 */
export function getCSRFToken(req: CSRFRequest): string | undefined {
  return req.csrfToken || req.cookies?.['csrf-token'];
}
