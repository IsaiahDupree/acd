/**
 * Security Headers Middleware (PCT-WC-036)
 * =========================================
 *
 * Implements secure HTTP headers including:
 * - Content-Security-Policy (CSP)
 * - HTTP Strict Transport Security (HSTS)
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - X-XSS-Protection
 * - Referrer-Policy
 */

import { Request, Response, NextFunction } from 'express';

export interface SecurityHeadersOptions {
    /**
     * Enable Content Security Policy
     * Helps prevent XSS attacks by controlling which resources can be loaded
     */
    enableCSP?: boolean;

    /**
     * Custom CSP directives (if not provided, secure defaults will be used)
     */
    cspDirectives?: {
        defaultSrc?: string[];
        scriptSrc?: string[];
        styleSrc?: string[];
        imgSrc?: string[];
        connectSrc?: string[];
        fontSrc?: string[];
        objectSrc?: string[];
        mediaSrc?: string[];
        frameSrc?: string[];
        baseUri?: string[];
        formAction?: string[];
        frameAncestors?: string[];
    };

    /**
     * Enable HTTP Strict Transport Security
     * Forces HTTPS connections for the specified duration
     */
    enableHSTS?: boolean;

    /**
     * HSTS max age in seconds (default: 1 year)
     */
    hstsMaxAge?: number;

    /**
     * Include subdomains in HSTS
     */
    hstsIncludeSubDomains?: boolean;

    /**
     * Enable HSTS preload (only use if you're sure!)
     */
    hstsPreload?: boolean;

    /**
     * X-Frame-Options value (default: 'DENY')
     * Options: 'DENY', 'SAMEORIGIN', or 'ALLOW-FROM uri'
     */
    xFrameOptions?: 'DENY' | 'SAMEORIGIN' | string;

    /**
     * Enable X-Content-Type-Options: nosniff
     * Prevents MIME type sniffing
     */
    enableNoSniff?: boolean;

    /**
     * Enable X-XSS-Protection (legacy, but still useful for older browsers)
     */
    enableXSSProtection?: boolean;

    /**
     * Referrer-Policy value
     */
    referrerPolicy?: 'no-referrer' | 'no-referrer-when-downgrade' | 'origin' | 'origin-when-cross-origin' | 'same-origin' | 'strict-origin' | 'strict-origin-when-cross-origin' | 'unsafe-url';
}

const DEFAULT_OPTIONS: SecurityHeadersOptions = {
    enableCSP: true,
    enableHSTS: true,
    hstsMaxAge: 31536000, // 1 year
    hstsIncludeSubDomains: true,
    hstsPreload: false,
    xFrameOptions: 'DENY',
    enableNoSniff: true,
    enableXSSProtection: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
};

/**
 * Build Content-Security-Policy header value from directives
 */
function buildCSPHeader(directives?: SecurityHeadersOptions['cspDirectives']): string {
    const defaultDirectives = {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Note: 'unsafe-inline' needed for some frameworks, consider nonce-based approach
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...directives,
    };

    const cspParts: string[] = [];
    for (const [directive, sources] of Object.entries(defaultDirectives)) {
        if (sources && sources.length > 0) {
            // Convert camelCase to kebab-case
            const kebabDirective = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
            cspParts.push(`${kebabDirective} ${sources.join(' ')}`);
        }
    }

    return cspParts.join('; ');
}

/**
 * Create security headers middleware
 */
export function securityHeaders(options?: SecurityHeadersOptions) {
    const config = { ...DEFAULT_OPTIONS, ...options };

    return (req: Request, res: Response, next: NextFunction) => {
        // Content-Security-Policy
        if (config.enableCSP) {
            const cspValue = buildCSPHeader(config.cspDirectives);
            res.setHeader('Content-Security-Policy', cspValue);
        }

        // HTTP Strict Transport Security (HSTS)
        if (config.enableHSTS) {
            const hstsDirectives = [`max-age=${config.hstsMaxAge}`];
            if (config.hstsIncludeSubDomains) {
                hstsDirectives.push('includeSubDomains');
            }
            if (config.hstsPreload) {
                hstsDirectives.push('preload');
            }
            res.setHeader('Strict-Transport-Security', hstsDirectives.join('; '));
        }

        // X-Frame-Options
        if (config.xFrameOptions) {
            res.setHeader('X-Frame-Options', config.xFrameOptions);
        }

        // X-Content-Type-Options
        if (config.enableNoSniff) {
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }

        // X-XSS-Protection (for older browsers)
        if (config.enableXSSProtection) {
            res.setHeader('X-XSS-Protection', '1; mode=block');
        }

        // Referrer-Policy
        if (config.referrerPolicy) {
            res.setHeader('Referrer-Policy', config.referrerPolicy);
        }

        // Permissions-Policy (formerly Feature-Policy)
        // Restrict access to sensitive APIs
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');

        next();
    };
}

/**
 * Development-friendly security headers (relaxed CSP for local development)
 */
export function devSecurityHeaders() {
    return securityHeaders({
        enableCSP: true,
        cspDirectives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'http://localhost:*', 'ws://localhost:*'],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:', 'http:'],
            connectSrc: ["'self'", 'http://localhost:*', 'ws://localhost:*', 'http://127.0.0.1:*'],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
        },
        enableHSTS: false, // Don't enforce HTTPS in development
        xFrameOptions: 'SAMEORIGIN', // Allow iframes from same origin in dev
    });
}

/**
 * Production-grade security headers (strict CSP)
 */
export function prodSecurityHeaders() {
    return securityHeaders({
        enableCSP: true,
        cspDirectives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"], // No inline scripts in production
            styleSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
        },
        enableHSTS: true,
        hstsMaxAge: 31536000, // 1 year
        hstsIncludeSubDomains: true,
        hstsPreload: false,
        xFrameOptions: 'DENY',
        enableNoSniff: true,
        enableXSSProtection: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
    });
}
