/**
 * JWT Authentication Middleware
 * ==============================
 * 
 * Handles user authentication and authorization for the API.
 */

import { Request, Response, NextFunction } from 'express';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { getAuthToken, setAuthCookies, clearAuthCookies } from './middleware/auth-cookies';

const prisma = new PrismaClient();

// ============================================
// CONFIGURATION
// ============================================

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ============================================
// TYPES
// ============================================

export interface JWTPayload {
    userId: string;
    email: string;
    organizationIds: string[];
}

export interface AuthenticatedRequest extends Request {
    user?: JWTPayload;
    organizationId?: string;
}

// ============================================
// TOKEN FUNCTIONS
// ============================================

export function generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as SignOptions);
}

export function verifyToken(token: string): JWTPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
        return null;
    }
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Require authentication for a route
 * Now supports both cookie-based and header-based authentication (PCT-WC-038)
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    // Get token from cookie or Authorization header
    const token = getAuthToken(req);

    if (!token) {
        return res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication' }
        });
    }

    const payload = verifyToken(token);

    if (!payload) {
        return res.status(401).json({
            error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
        });
    }

    req.user = payload;

    // Set organization from header if provided
    const orgHeader = req.headers['x-organization-id'];
    if (orgHeader && typeof orgHeader === 'string') {
        if (!payload.organizationIds.includes(orgHeader)) {
            return res.status(403).json({
                error: { code: 'FORBIDDEN', message: 'Not a member of this organization' }
            });
        }
        req.organizationId = orgHeader;
    }

    next();
}

/**
 * Optional authentication - sets user if token present
 * Now supports both cookie-based and header-based authentication (PCT-WC-038)
 */
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const token = getAuthToken(req);

    if (token) {
        const payload = verifyToken(token);
        if (payload) {
            req.user = payload;
        }
    }

    next();
}

/**
 * Require specific organization membership
 */
export function requireOrg(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    if (!req.organizationId) {
        return res.status(400).json({
            error: { code: 'MISSING_ORG', message: 'X-Organization-Id header required' }
        });
    }
    next();
}

/**
 * API Key authentication (for service-to-service calls)
 */
export async function apiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
        return res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'API key required' }
        });
    }

    // Hash the key and look it up
    const token = await prisma.apiToken.findFirst({
        where: {
            tokenHash: await hashPassword(apiKey),
            OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } }
            ]
        },
        include: {
            user: {
                include: {
                    memberships: { select: { orgId: true } }
                }
            }
        }
    });

    if (!token) {
        return res.status(401).json({
            error: { code: 'INVALID_API_KEY', message: 'Invalid or expired API key' }
        });
    }

    // Update last used
    await prisma.apiToken.update({
        where: { id: token.id },
        data: { lastUsedAt: new Date() }
    });

    req.user = {
        userId: token.user.id,
        email: token.user.email,
        organizationIds: token.user.memberships.map(m => m.orgId)
    };

    next();
}

// ============================================
// AUTH ROUTES
// ============================================

import { Router } from 'express';

export const authRouter = Router();

/**
 * POST /auth/register
 */
authRouter.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name, organizationName } = req.body;

        // Validate
        if (!email || !password || !name) {
            return res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'Email, password, and name are required' }
            });
        }

        // Check if user exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({
                error: { code: 'USER_EXISTS', message: 'Email already registered' }
            });
        }

        // Create user
        const passwordHash = await hashPassword(password);
        const user = await prisma.user.create({
            data: { email, name, passwordHash }
        });

        // Create default organization
        const org = await prisma.organization.create({
            data: {
                name: organizationName || `${name}'s Workspace`,
                slug: email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-'),
                memberships: {
                    create: {
                        userId: user.id,
                        role: 'owner'
                    }
                }
            }
        });

        // Generate token
        const token = generateToken({
            userId: user.id,
            email: user.email,
            organizationIds: [org.id]
        });

        res.status(201).json({
            data: {
                token,
                user: { id: user.id, email: user.email, name: user.name },
                organization: { id: org.id, name: org.name }
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Registration failed' } });
    }
});

/**
 * POST /auth/login
 */
authRouter.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                memberships: { select: { orgId: true, role: true } }
            }
        });

        if (!user || !user.passwordHash) {
            return res.status(401).json({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
            });
        }

        // Check password
        const valid = await comparePassword(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
            });
        }

        // Generate token
        const token = generateToken({
            userId: user.id,
            email: user.email,
            organizationIds: user.memberships.map(m => m.orgId)
        });

        // Set secure cookies (PCT-WC-038: HttpOnly, Secure, SameSite)
        setAuthCookies(res, token);

        res.json({
            data: {
                token, // Still return token for API clients
                user: { id: user.id, email: user.email, name: user.name },
                organizations: user.memberships
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Login failed' } });
    }
});

/**
 * GET /auth/me
 */
authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.userId },
            include: {
                memberships: {
                    include: { org: { select: { id: true, name: true, slug: true } } }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
        }

        res.json({
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
                organizations: user.memberships.map(m => ({
                    ...m.org,
                    role: m.role
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to get user' } });
    }
});

/**
 * POST /auth/tokens
 */
authRouter.post('/tokens', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { name, scopes = [], expiresInDays } = req.body;

        // Generate random token
        const rawToken = `ac_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url')}`;
        const tokenHash = await hashPassword(rawToken);

        const apiToken = await prisma.apiToken.create({
            data: {
                userId: req.user!.userId,
                name: name || 'API Token',
                tokenHash,
                scopes,
                expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null
            }
        });

        res.status(201).json({
            data: {
                id: apiToken.id,
                token: rawToken, // Only shown once!
                name: apiToken.name,
                createdAt: apiToken.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create token' } });
    }
});

/**
 * DELETE /auth/tokens/:id
 */
authRouter.delete('/tokens/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        await prisma.apiToken.deleteMany({
            where: {
                id: req.params.id,
                userId: req.user!.userId
            }
        });

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete token' } });
    }
});

/**
 * POST /auth/logout
 * Logout user and clear authentication cookies (PCT-WC-038)
 */
authRouter.post('/logout', (req: Request, res: Response) => {
    try {
        // Clear authentication cookies
        clearAuthCookies(res);

        res.json({
            data: { message: 'Logged out successfully' }
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Logout failed' } });
    }
});

/**
 * POST /auth/refresh
 * Refresh authentication token (PCT-WC-038 - Token Rotation)
 */
authRouter.post('/refresh', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        // Generate new token with same payload
        const newToken = generateToken({
            userId: req.user!.userId,
            email: req.user!.email,
            organizationIds: req.user!.organizationIds
        });

        // Set new secure cookies
        setAuthCookies(res, newToken);

        res.json({
            data: {
                token: newToken,
                message: 'Token refreshed successfully'
            }
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Token refresh failed' } });
    }
});

export default { authRouter, requireAuth, optionalAuth, requireOrg, apiKeyAuth };
