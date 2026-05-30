/**
 * Input Sanitization Middleware
 * ==============================
 *
 * Sanitizes all user inputs to prevent XSS, SQL injection, and other attacks.
 * Validates input types, lengths, and formats.
 *
 * Feature: PCT-WC-034
 */

import { Request, Response, NextFunction } from 'express';

// ============================================
// SANITIZATION FUNCTIONS
// ============================================

/**
 * Sanitize HTML to prevent XSS attacks
 */
export function sanitizeHTML(input: string): string {
  if (typeof input !== 'string') return input;

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Strip HTML tags completely
 */
export function stripHTML(input: string): string {
  if (typeof input !== 'string') return input;

  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '');
}

/**
 * Sanitize string by trimming and limiting length
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') return '';

  return input
    .trim()
    .slice(0, maxLength)
    .replace(/\0/g, ''); // Remove null bytes
}

/**
 * Validate and sanitize email
 */
export function sanitizeEmail(email: string): string | null {
  if (typeof email !== 'string') return null;

  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize URL and validate scheme
 */
export function sanitizeURL(url: string): string | null {
  if (typeof url !== 'string') return null;

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize filename to prevent path traversal
 */
export function sanitizeFilename(filename: string): string | null {
  if (typeof filename !== 'string') return null;

  // Prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }

  // Only allow safe characters
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  if (sanitized.length === 0 || sanitized.length > 255) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitize file path to prevent traversal
 */
export function sanitizeFilePath(path: string): string | null {
  if (typeof path !== 'string') return null;

  // Prevent directory traversal
  if (path.includes('..')) return null;
  if (path.startsWith('/')) return null;

  return path.replace(/[^a-zA-Z0-9._/-]/g, '_');
}

/**
 * Prevent NoSQL injection by rejecting objects and special operators
 */
export function sanitizeNoSQLInput(input: any): any {
  // Reject objects and arrays
  if (typeof input === 'object' && input !== null) {
    return null;
  }

  // Only allow string and number primitives
  if (typeof input !== 'string' && typeof input !== 'number' && typeof input !== 'boolean') {
    return null;
  }

  return input;
}

/**
 * Deep sanitize an object recursively
 */
export function deepSanitize(obj: any, options: SanitizationOptions = {}): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    let result = obj;

    // Always trim and apply length limits first
    result = sanitizeString(result, options.maxLength);

    // Then apply HTML handling
    if (options.stripHTML) {
      result = stripHTML(result);
    } else if (options.escapeHTML) {
      result = sanitizeHTML(result);
    }

    return result;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    if (options.maxArrayLength && obj.length > options.maxArrayLength) {
      throw new Error(`Array length exceeds maximum of ${options.maxArrayLength}`);
    }
    return obj.map(item => deepSanitize(item, options));
  }

  if (typeof obj === 'object') {
    if (options.maxDepth !== undefined && options.maxDepth <= 0) {
      throw new Error('Object nesting too deep');
    }

    const sanitized: any = {};
    const newOptions = options.maxDepth !== undefined
      ? { ...options, maxDepth: options.maxDepth - 1 }
      : options;

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Prevent prototype pollution
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }

        sanitized[key] = deepSanitize(obj[key], newOptions);
      }
    }

    return sanitized;
  }

  return obj;
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate string length
 */
export function validateLength(input: string, min: number, max: number): boolean {
  return typeof input === 'string' && input.length >= min && input.length <= max;
}

/**
 * Validate number range
 */
export function validateRange(num: number, min: number, max: number): boolean {
  return typeof num === 'number' && num >= min && num <= max;
}

/**
 * Validate enum value
 */
export function validateEnum<T extends string>(value: string, allowedValues: readonly T[]): value is T {
  return allowedValues.includes(value as T);
}

/**
 * Validate UUID format
 */
export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Validate alphanumeric with specific characters
 */
export function isAlphanumeric(input: string, allowedChars: string = '-_'): boolean {
  const pattern = new RegExp(`^[a-zA-Z0-9${allowedChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]+$`);
  return pattern.test(input);
}

// ============================================
// MIDDLEWARE
// ============================================

export interface SanitizationOptions {
  stripHTML?: boolean;
  escapeHTML?: boolean;
  maxLength?: number;
  maxDepth?: number;
  maxArrayLength?: number;
}

/**
 * Sanitize request body middleware
 */
export function sanitizeBody(options: SanitizationOptions = {}) {
  const defaultOptions: SanitizationOptions = {
    escapeHTML: true,
    maxLength: 10000,
    maxDepth: 10,
    maxArrayLength: 1000,
    ...options,
  };

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.body && typeof req.body === 'object') {
        req.body = deepSanitize(req.body, defaultOptions);
      }
      next();
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: error instanceof Error ? error.message : 'Input validation failed',
        },
      });
    }
  };
}

/**
 * Sanitize query parameters middleware
 */
export function sanitizeQuery(options: SanitizationOptions = {}) {
  const defaultOptions: SanitizationOptions = {
    escapeHTML: true,
    maxLength: 1000,
    maxDepth: 3,
    maxArrayLength: 100,
    ...options,
  };

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.query && typeof req.query === 'object') {
        req.query = deepSanitize(req.query, defaultOptions);
      }
      next();
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'INVALID_QUERY',
          message: error instanceof Error ? error.message : 'Query validation failed',
        },
      });
    }
  };
}

/**
 * Sanitize route parameters middleware
 */
export function sanitizeParams() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.params && typeof req.params === 'object') {
        for (const key in req.params) {
          if (req.params.hasOwnProperty(key)) {
            req.params[key] = sanitizeString(req.params[key], 100);
          }
        }
      }
      next();
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'INVALID_PARAMS',
          message: 'Parameter validation failed',
        },
      });
    }
  };
}

/**
 * Combined sanitization middleware for all inputs
 */
export function sanitizeAllInputs(options: SanitizationOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    sanitizeParams()(req, res, (err1) => {
      if (err1) return next(err1);
      sanitizeQuery(options)(req, res, (err2) => {
        if (err2) return next(err2);
        sanitizeBody(options)(req, res, next);
      });
    });
  };
}
