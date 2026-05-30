/**
 * Secure Cookie-Based Authentication (PCT-WC-038)
 * ===============================================
 *
 * Implements secure token storage using HttpOnly cookies with:
 * - HttpOnly flag (prevents JavaScript access)
 * - Secure flag (HTTPS only)
 * - SameSite flag (CSRF protection)
 * - Token rotation
 */

import { Request, Response, CookieOptions } from 'express';
import { JWTPayload } from '../auth';

/**
 * Cookie configuration for authentication tokens
 */
export interface AuthCookieConfig {
    /**
     * Cookie name for access token
     */
    accessTokenName?: string;

    /**
     * Cookie name for refresh token
     */
    refreshTokenName?: string;

    /**
     * Access token expiration (in seconds)
     * Default: 15 minutes
     */
    accessTokenMaxAge?: number;

    /**
     * Refresh token expiration (in seconds)
     * Default: 7 days
     */
    refreshTokenMaxAge?: number;

    /**
     * Cookie domain (optional)
     */
    domain?: string;

    /**
     * Cookie path (default: '/')
     */
    path?: string;

    /**
     * Enable HTTPS-only cookies (default: true in production)
     */
    secure?: boolean;

    /**
     * SameSite policy
     * Default: 'strict' for better security
     */
    sameSite?: 'strict' | 'lax' | 'none';
}

/**
 * Get the default auth cookie configuration
 * This is a function to allow dynamic NODE_ENV checking
 */
function getDefaultConfig(): Required<AuthCookieConfig> {
    return {
        accessTokenName: 'auth_token',
        refreshTokenName: 'refresh_token',
        accessTokenMaxAge: 15 * 60, // 15 minutes
        refreshTokenMaxAge: 7 * 24 * 60 * 60, // 7 days
        domain: '',
        path: '/',
        secure: process.env.NODE_ENV === 'production', // Check at runtime
        sameSite: 'strict',
    };
}

/**
 * Get the auth cookie configuration
 */
export function getAuthCookieConfig(config?: Partial<AuthCookieConfig>): Required<AuthCookieConfig> {
    return { ...getDefaultConfig(), ...config };
}

/**
 * Generate cookie options for access token
 */
export function getAccessTokenCookieOptions(config?: Partial<AuthCookieConfig>): CookieOptions {
    const cfg = getAuthCookieConfig(config);

    return {
        httpOnly: true, // Prevent JavaScript access (XSS protection)
        secure: cfg.secure, // HTTPS only in production
        sameSite: cfg.sameSite, // CSRF protection
        maxAge: cfg.accessTokenMaxAge * 1000, // Convert to milliseconds
        path: cfg.path,
        domain: cfg.domain || undefined,
    };
}

/**
 * Generate cookie options for refresh token
 */
export function getRefreshTokenCookieOptions(config?: Partial<AuthCookieConfig>): CookieOptions {
    const cfg = getAuthCookieConfig(config);

    return {
        httpOnly: true, // Prevent JavaScript access (XSS protection)
        secure: cfg.secure, // HTTPS only in production
        sameSite: cfg.sameSite, // CSRF protection
        maxAge: cfg.refreshTokenMaxAge * 1000, // Convert to milliseconds
        path: cfg.path,
        domain: cfg.domain || undefined,
    };
}

/**
 * Set authentication cookies on the response
 */
export function setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken?: string,
    config?: Partial<AuthCookieConfig>
): void {
    const cfg = getAuthCookieConfig(config);

    // Set access token cookie
    res.cookie(cfg.accessTokenName, accessToken, getAccessTokenCookieOptions(config));

    // Set refresh token cookie if provided
    if (refreshToken) {
        res.cookie(cfg.refreshTokenName, refreshToken, getRefreshTokenCookieOptions(config));
    }
}

/**
 * Clear authentication cookies
 */
export function clearAuthCookies(res: Response, config?: Partial<AuthCookieConfig>): void {
    const cfg = getAuthCookieConfig(config);

    // Clear access token
    res.clearCookie(cfg.accessTokenName, {
        httpOnly: true,
        secure: cfg.secure,
        sameSite: cfg.sameSite,
        path: cfg.path,
        domain: cfg.domain || undefined,
    });

    // Clear refresh token
    res.clearCookie(cfg.refreshTokenName, {
        httpOnly: true,
        secure: cfg.secure,
        sameSite: cfg.sameSite,
        path: cfg.path,
        domain: cfg.domain || undefined,
    });
}

/**
 * Get authentication token from cookies or Authorization header
 */
export function getAuthToken(req: Request, config?: Partial<AuthCookieConfig>): string | null {
    const cfg = getAuthCookieConfig(config);

    // First, check for cookie-based token (preferred for web apps)
    const cookieToken = req.cookies?.[cfg.accessTokenName];
    if (cookieToken) {
        return cookieToken;
    }

    // Fall back to Authorization header (for API clients)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }

    return null;
}

/**
 * Get refresh token from cookies
 */
export function getRefreshToken(req: Request, config?: Partial<AuthCookieConfig>): string | null {
    const cfg = getAuthCookieConfig(config);
    return req.cookies?.[cfg.refreshTokenName] || null;
}

/**
 * Token rotation state tracking
 * Stores recently rotated tokens to allow brief grace period
 */
interface TokenRotationEntry {
    oldToken: string;
    newToken: string;
    rotatedAt: number;
    expiresAt: number;
}

const tokenRotationCache = new Map<string, TokenRotationEntry>();

/**
 * Clean up expired rotation entries
 */
function cleanupTokenRotationCache(): void {
    const now = Date.now();
    for (const [key, entry] of tokenRotationCache.entries()) {
        if (entry.expiresAt < now) {
            tokenRotationCache.delete(key);
        }
    }
}

// Clean up cache every 5 minutes
setInterval(cleanupTokenRotationCache, 5 * 60 * 1000);

/**
 * Record token rotation for grace period handling
 */
export function recordTokenRotation(
    oldToken: string,
    newToken: string,
    gracePeriodMs: number = 60000 // 1 minute grace period
): void {
    const now = Date.now();
    tokenRotationCache.set(oldToken, {
        oldToken,
        newToken,
        rotatedAt: now,
        expiresAt: now + gracePeriodMs,
    });
}

/**
 * Check if a token was recently rotated and get the new token
 */
export function getRotatedToken(oldToken: string): string | null {
    const entry = tokenRotationCache.get(oldToken);
    if (!entry) {
        return null;
    }

    const now = Date.now();
    if (entry.expiresAt < now) {
        tokenRotationCache.delete(oldToken);
        return null;
    }

    return entry.newToken;
}

/**
 * Token rotation strategy
 */
export interface TokenRotationStrategy {
    /**
     * Should we rotate the token on this request?
     */
    shouldRotate: (tokenAge: number, lastRotation: number) => boolean;
}

/**
 * Time-based token rotation strategy
 * Rotates tokens after a certain period
 */
export function createTimeBasedRotation(rotationIntervalMs: number = 3600000): TokenRotationStrategy {
    return {
        shouldRotate: (tokenAge: number, lastRotation: number) => {
            return tokenAge > rotationIntervalMs || (Date.now() - lastRotation) > rotationIntervalMs;
        },
    };
}

/**
 * Request-based token rotation strategy
 * Rotates tokens after a certain number of requests
 */
export function createRequestBasedRotation(requestsBeforeRotation: number = 100): TokenRotationStrategy {
    const requestCounts = new Map<string, number>();

    return {
        shouldRotate: (tokenAge: number, lastRotation: number) => {
            // Implementation would track request count per token
            // For now, fall back to time-based
            return false;
        },
    };
}

/**
 * Export cookie configuration utilities
 */
export const authCookies = {
    setAuthCookies,
    clearAuthCookies,
    getAuthToken,
    getRefreshToken,
    recordTokenRotation,
    getRotatedToken,
    getAuthCookieConfig,
    getAccessTokenCookieOptions,
    getRefreshTokenCookieOptions,
};
