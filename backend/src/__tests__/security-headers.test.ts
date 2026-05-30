/**
 * Security Headers Middleware Tests (PCT-WC-036)
 * ===============================================
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { securityHeaders, devSecurityHeaders, prodSecurityHeaders } from '../middleware/security-headers';

describe('Security Headers Middleware (PCT-WC-036)', () => {
    describe('Basic security headers', () => {
        it('should set Content-Security-Policy header', async () => {
            const app = express();
            app.use(securityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['content-security-policy']).toBeDefined();
            expect(response.headers['content-security-policy']).toContain("default-src 'self'");
        });

        it('should set Strict-Transport-Security header', async () => {
            const app = express();
            app.use(securityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['strict-transport-security']).toBeDefined();
            expect(response.headers['strict-transport-security']).toContain('max-age=');
        });

        it('should set X-Frame-Options header', async () => {
            const app = express();
            app.use(securityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['x-frame-options']).toBeDefined();
            expect(response.headers['x-frame-options']).toBe('DENY');
        });

        it('should set X-Content-Type-Options header', async () => {
            const app = express();
            app.use(securityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['x-content-type-options']).toBeDefined();
            expect(response.headers['x-content-type-options']).toBe('nosniff');
        });

        it('should set X-XSS-Protection header', async () => {
            const app = express();
            app.use(securityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['x-xss-protection']).toBeDefined();
            expect(response.headers['x-xss-protection']).toBe('1; mode=block');
        });

        it('should set Referrer-Policy header', async () => {
            const app = express();
            app.use(securityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['referrer-policy']).toBeDefined();
            expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
        });

        it('should set Permissions-Policy header', async () => {
            const app = express();
            app.use(securityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['permissions-policy']).toBeDefined();
        });
    });

    describe('Custom CSP directives', () => {
        it('should allow custom CSP directives', async () => {
            const app = express();
            app.use(securityHeaders({
                cspDirectives: {
                    scriptSrc: ["'self'", 'https://cdn.example.com'],
                }
            }));
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            const csp = response.headers['content-security-policy'];
            expect(csp).toContain("script-src 'self' https://cdn.example.com");
        });

        it('should disable CSP when enableCSP is false', async () => {
            const app = express();
            app.use(securityHeaders({ enableCSP: false }));
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['content-security-policy']).toBeUndefined();
        });
    });

    describe('HSTS configuration', () => {
        it('should configure HSTS max-age', async () => {
            const app = express();
            app.use(securityHeaders({ hstsMaxAge: 86400 })); // 1 day
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['strict-transport-security']).toContain('max-age=86400');
        });

        it('should include subdomains in HSTS when enabled', async () => {
            const app = express();
            app.use(securityHeaders({ hstsIncludeSubDomains: true }));
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['strict-transport-security']).toContain('includeSubDomains');
        });

        it('should disable HSTS when enableHSTS is false', async () => {
            const app = express();
            app.use(securityHeaders({ enableHSTS: false }));
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['strict-transport-security']).toBeUndefined();
        });
    });

    describe('X-Frame-Options configuration', () => {
        it('should set X-Frame-Options to SAMEORIGIN', async () => {
            const app = express();
            app.use(securityHeaders({ xFrameOptions: 'SAMEORIGIN' }));
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
        });
    });

    describe('Development security headers', () => {
        it('should use relaxed CSP for development', async () => {
            const app = express();
            app.use(devSecurityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            const csp = response.headers['content-security-policy'];
            expect(csp).toContain('http://localhost:*');
            expect(csp).toContain("'unsafe-eval'");
        });

        it('should not enable HSTS in development', async () => {
            const app = express();
            app.use(devSecurityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['strict-transport-security']).toBeUndefined();
        });

        it('should use SAMEORIGIN for X-Frame-Options in development', async () => {
            const app = express();
            app.use(devSecurityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
        });
    });

    describe('Production security headers', () => {
        it('should use strict CSP for production', async () => {
            const app = express();
            app.use(prodSecurityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            const csp = response.headers['content-security-policy'];
            expect(csp).toContain("default-src 'self'");
            expect(csp).not.toContain("'unsafe-eval'");
        });

        it('should enable HSTS in production', async () => {
            const app = express();
            app.use(prodSecurityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['strict-transport-security']).toBeDefined();
            expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
        });

        it('should use DENY for X-Frame-Options in production', async () => {
            const app = express();
            app.use(prodSecurityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');
            expect(response.headers['x-frame-options']).toBe('DENY');
        });
    });

    describe('All required headers (acceptance criteria)', () => {
        it('should set all required headers (CSP, HSTS, X-Frame, X-Content-Type)', async () => {
            const app = express();
            app.use(securityHeaders());
            app.get('/test', (req, res) => res.send('OK'));

            const response = await request(app).get('/test');

            // Verify all acceptance criteria from PCT-WC-036
            expect(response.headers['content-security-policy']).toBeDefined(); // CSP
            expect(response.headers['strict-transport-security']).toBeDefined(); // HSTS
            expect(response.headers['x-frame-options']).toBeDefined(); // X-Frame
            expect(response.headers['x-content-type-options']).toBeDefined(); // X-Content-Type
        });
    });
});
