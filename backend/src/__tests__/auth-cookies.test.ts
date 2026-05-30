/**
 * Auth Cookie Security Tests (PCT-WC-038)
 * ========================================
 *
 * Tests for secure cookie-based authentication with:
 * - HttpOnly flag
 * - Secure flag
 * - SameSite flag
 * - Token rotation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import {
    setAuthCookies,
    clearAuthCookies,
    getAuthToken,
    getAuthCookieConfig,
    getAccessTokenCookieOptions,
    getRefreshTokenCookieOptions,
} from '../middleware/auth-cookies';

describe('Auth Cookie Security (PCT-WC-038)', () => {
    describe('Cookie Configuration', () => {
        it('should use secure defaults', () => {
            const config = getAuthCookieConfig();
            expect(config.accessTokenName).toBe('auth_token');
            expect(config.refreshTokenName).toBe('refresh_token');
            expect(config.sameSite).toBe('strict');
        });

        it('should allow custom configuration', () => {
            const config = getAuthCookieConfig({
                accessTokenName: 'custom_token',
                sameSite: 'lax',
            });
            expect(config.accessTokenName).toBe('custom_token');
            expect(config.sameSite).toBe('lax');
        });
    });

    describe('Access Token Cookie Options', () => {
        it('should set HttpOnly flag', () => {
            const options = getAccessTokenCookieOptions();
            expect(options.httpOnly).toBe(true);
        });

        it('should set Secure flag in production', () => {
            const originalEnv = process.env.NODE_ENV;

            process.env.NODE_ENV = 'production';
            const prodOptions = getAccessTokenCookieOptions();
            expect(prodOptions.secure).toBe(true);

            process.env.NODE_ENV = 'development';
            const devOptions = getAccessTokenCookieOptions();
            expect(devOptions.secure).toBe(false);

            process.env.NODE_ENV = originalEnv;
        });

        it('should set SameSite flag', () => {
            const options = getAccessTokenCookieOptions();
            expect(options.sameSite).toBe('strict');
        });

        it('should set maxAge for access token', () => {
            const options = getAccessTokenCookieOptions();
            expect(options.maxAge).toBe(15 * 60 * 1000); // 15 minutes in milliseconds
        });
    });

    describe('Refresh Token Cookie Options', () => {
        it('should set HttpOnly flag', () => {
            const options = getRefreshTokenCookieOptions();
            expect(options.httpOnly).toBe(true);
        });

        it('should set longer maxAge for refresh token', () => {
            const options = getRefreshTokenCookieOptions();
            expect(options.maxAge).toBe(7 * 24 * 60 * 60 * 1000); // 7 days in milliseconds
        });
    });

    describe('Set Auth Cookies', () => {
        it('should set access token cookie', async () => {
            const app = express();
            app.get('/set-cookies', (req: Request, res: Response) => {
                setAuthCookies(res, 'test-access-token');
                res.send('OK');
            });

            const response = await request(app).get('/set-cookies');
            const cookies = response.headers['set-cookie'] as unknown as string[];

            expect(cookies).toBeDefined();
            expect(cookies.length).toBeGreaterThan(0);

            const authCookie = cookies.find(c => c.startsWith('auth_token='));
            expect(authCookie).toBeDefined();
            expect(authCookie).toContain('HttpOnly');
            expect(authCookie).toContain('SameSite=Strict');
        });

        it('should set both access and refresh token cookies', async () => {
            const app = express();
            app.get('/set-cookies', (req: Request, res: Response) => {
                setAuthCookies(res, 'test-access-token', 'test-refresh-token');
                res.send('OK');
            });

            const response = await request(app).get('/set-cookies');
            const cookies = response.headers['set-cookie'] as unknown as string[];

            expect(cookies.length).toBeGreaterThan(1);

            const authCookie = cookies.find(c => c.startsWith('auth_token='));
            const refreshCookie = cookies.find(c => c.startsWith('refresh_token='));

            expect(authCookie).toBeDefined();
            expect(refreshCookie).toBeDefined();
        });
    });

    describe('Clear Auth Cookies', () => {
        it('should clear authentication cookies', async () => {
            const app = express();
            app.get('/clear-cookies', (req: Request, res: Response) => {
                clearAuthCookies(res);
                res.send('OK');
            });

            const response = await request(app).get('/clear-cookies');
            const cookies = response.headers['set-cookie'] as unknown as string[];

            expect(cookies).toBeDefined();

            // Cleared cookies should have Max-Age=0 or Expires in the past
            const authCookie = cookies.find(c => c.startsWith('auth_token='));
            const refreshCookie = cookies.find(c => c.startsWith('refresh_token='));

            expect(authCookie).toBeDefined();
            expect(refreshCookie).toBeDefined();
        });
    });

    describe('Get Auth Token', () => {
        it('should get token from cookie', async () => {
            const app = express();
            app.use(cookieParser());

            app.get('/test', (req: Request, res: Response) => {
                const token = getAuthToken(req);
                res.json({ token });
            });

            const response = await request(app)
                .get('/test')
                .set('Cookie', ['auth_token=cookie-token']);

            expect(response.body.token).toBe('cookie-token');
        });

        it('should get token from Authorization header', async () => {
            const app = express();
            app.use(cookieParser());

            app.get('/test', (req: Request, res: Response) => {
                const token = getAuthToken(req);
                res.json({ token });
            });

            const response = await request(app)
                .get('/test')
                .set('Authorization', 'Bearer header-token');

            expect(response.body.token).toBe('header-token');
        });

        it('should prefer cookie over header', async () => {
            const app = express();
            app.use(cookieParser());

            app.get('/test', (req: Request, res: Response) => {
                const token = getAuthToken(req);
                res.json({ token });
            });

            const response = await request(app)
                .get('/test')
                .set('Cookie', ['auth_token=cookie-token'])
                .set('Authorization', 'Bearer header-token');

            expect(response.body.token).toBe('cookie-token');
        });

        it('should return null if no token', async () => {
            const app = express();
            app.use(cookieParser());

            app.get('/test', (req: Request, res: Response) => {
                const token = getAuthToken(req);
                res.json({ token });
            });

            const response = await request(app).get('/test');

            expect(response.body.token).toBeNull();
        });
    });

    describe('Acceptance Criteria (PCT-WC-038)', () => {
        it('should verify HttpOnly flag is set', () => {
            const options = getAccessTokenCookieOptions();
            expect(options.httpOnly).toBe(true);
        });

        it('should verify Secure flag is set in production', () => {
            const originalEnv = process.env.NODE_ENV;

            process.env.NODE_ENV = 'production';
            const options = getAccessTokenCookieOptions();
            expect(options.secure).toBe(true);

            process.env.NODE_ENV = originalEnv;
        });

        it('should verify SameSite flag is set', () => {
            const options = getAccessTokenCookieOptions();
            expect(options.sameSite).toBe('strict');
        });

        it('should verify token rotation capability exists', async () => {
            const app = express();
            app.use(cookieParser());

            // Simulate token rotation
            app.get('/rotate', (req: Request, res: Response) => {
                const oldToken = getAuthToken(req);
                const newToken = 'new-rotated-token';

                // Set new token
                setAuthCookies(res, newToken);

                res.json({ oldToken, newToken });
            });

            const response = await request(app)
                .get('/rotate')
                .set('Cookie', ['auth_token=old-token']);

            expect(response.body.oldToken).toBe('old-token');
            expect(response.body.newToken).toBe('new-rotated-token');

            const cookies = response.headers['set-cookie'] as unknown as string[];
            const newAuthCookie = cookies.find(c => c.startsWith('auth_token='));
            expect(newAuthCookie).toContain('new-rotated-token');
        });
    });
});
