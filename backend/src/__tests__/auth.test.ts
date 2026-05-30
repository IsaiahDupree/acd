/**
 * CF-WC-001: Unit tests for auth flows
 *
 * Tests: Sign-in, Sign-up, Session, Password Reset
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as auth from '../auth';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock JWT secret for tests
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '7d';

describe('Auth Flows - CF-WC-001', () => {
  describe('Token Functions', () => {
    it('should generate valid JWT token', () => {
      const payload: auth.JWTPayload = {
        userId: 'user123',
        email: 'test@example.com',
        organizationIds: ['org1', 'org2'],
      };

      const token = auth.generateToken(payload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should verify valid JWT token', () => {
      const payload: auth.JWTPayload = {
        userId: 'user123',
        email: 'test@example.com',
        organizationIds: ['org1'],
      };

      const token = auth.generateToken(payload);
      const verified = auth.verifyToken(token);

      expect(verified).toBeTruthy();
      expect(verified?.userId).toBe('user123');
      expect(verified?.email).toBe('test@example.com');
      expect(verified?.organizationIds).toEqual(['org1']);
    });

    it('should return null for invalid JWT token', () => {
      const verified = auth.verifyToken('invalid-token');
      expect(verified).toBeNull();
    });

    it('should return null for expired JWT token', () => {
      const payload: auth.JWTPayload = {
        userId: 'user123',
        email: 'test@example.com',
        organizationIds: ['org1'],
      };

      // Create an expired token
      const expiredToken = jwt.sign(payload, 'test-secret-key', {
        expiresIn: '-1s', // Already expired
      });

      const verified = auth.verifyToken(expiredToken);
      expect(verified).toBeNull();
    });
  });

  describe('Password Functions', () => {
    it('should hash password', async () => {
      const password = 'mySecurePassword123';
      const hash = await auth.hashPassword(password);

      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true); // bcrypt format
    });

    it('should compare password correctly - valid password', async () => {
      const password = 'mySecurePassword123';
      const hash = await auth.hashPassword(password);
      const isValid = await auth.comparePassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should compare password correctly - invalid password', async () => {
      const password = 'mySecurePassword123';
      const hash = await auth.hashPassword(password);
      const isValid = await auth.comparePassword('wrongPassword', hash);

      expect(isValid).toBe(false);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'mySecurePassword123';
      const hash1 = await auth.hashPassword(password);
      const hash2 = await auth.hashPassword(password);

      expect(hash1).not.toBe(hash2); // Should use different salts
      expect(await auth.comparePassword(password, hash1)).toBe(true);
      expect(await auth.comparePassword(password, hash2)).toBe(true);
    });
  });

  describe('Middleware - requireAuth', () => {
    it('should reject request without authorization header', () => {
      const req = {
        headers: {},
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      auth.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authentication',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid bearer token format', () => {
      const req = {
        headers: {
          authorization: 'InvalidFormat token123',
        },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      auth.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', () => {
      const req = {
        headers: {
          authorization: 'Bearer invalid-token',
        },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      auth.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept request with valid token', () => {
      const payload: auth.JWTPayload = {
        userId: 'user123',
        email: 'test@example.com',
        organizationIds: ['org1'],
      };

      const token = auth.generateToken(payload);

      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      auth.requireAuth(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('user123');
      expect(req.user.email).toBe('test@example.com');
      expect(next).toHaveBeenCalled();
    });

    it('should set organization from header if valid', () => {
      const payload: auth.JWTPayload = {
        userId: 'user123',
        email: 'test@example.com',
        organizationIds: ['org1', 'org2'],
      };

      const token = auth.generateToken(payload);

      const req = {
        headers: {
          authorization: `Bearer ${token}`,
          'x-organization-id': 'org1',
        },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      auth.requireAuth(req, res, next);

      expect(req.organizationId).toBe('org1');
      expect(next).toHaveBeenCalled();
    });

    it('should reject if organization header is not in user memberships', () => {
      const payload: auth.JWTPayload = {
        userId: 'user123',
        email: 'test@example.com',
        organizationIds: ['org1'],
      };

      const token = auth.generateToken(payload);

      const req = {
        headers: {
          authorization: `Bearer ${token}`,
          'x-organization-id': 'org999', // Not in user's orgs
        },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      auth.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'Not a member of this organization',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Middleware - optionalAuth', () => {
    it('should proceed without error when no token provided', () => {
      const req = {
        headers: {},
      } as any;

      const res = {} as any;
      const next = vi.fn();

      auth.optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should set user when valid token provided', () => {
      const payload: auth.JWTPayload = {
        userId: 'user123',
        email: 'test@example.com',
        organizationIds: ['org1'],
      };

      const token = auth.generateToken(payload);

      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;

      const res = {} as any;
      const next = vi.fn();

      auth.optionalAuth(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('user123');
      expect(next).toHaveBeenCalled();
    });

    it('should proceed without setting user when invalid token provided', () => {
      const req = {
        headers: {
          authorization: 'Bearer invalid-token',
        },
      } as any;

      const res = {} as any;
      const next = vi.fn();

      auth.optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Middleware - requireOrg', () => {
    it('should reject when organizationId not set', () => {
      const req = {} as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      auth.requireOrg(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'MISSING_ORG',
          message: 'X-Organization-Id header required',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should proceed when organizationId is set', () => {
      const req = {
        organizationId: 'org1',
      } as any;

      const res = {} as any;
      const next = vi.fn();

      auth.requireOrg(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Session Management', () => {
    it('should create session with proper expiry time', () => {
      const payload: auth.JWTPayload = {
        userId: 'user123',
        email: 'test@example.com',
        organizationIds: ['org1'],
      };

      const token = auth.generateToken(payload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();

      const expiryTime = decoded.exp - decoded.iat;
      expect(expiryTime).toBe(7 * 24 * 60 * 60); // 7 days in seconds
    });

    it('should include all required payload fields in token', () => {
      const payload: auth.JWTPayload = {
        userId: 'user123',
        email: 'test@example.com',
        organizationIds: ['org1', 'org2'],
      };

      const token = auth.generateToken(payload);
      const verified = auth.verifyToken(token);

      expect(verified).toBeDefined();
      expect(verified?.userId).toBe(payload.userId);
      expect(verified?.email).toBe(payload.email);
      expect(verified?.organizationIds).toEqual(payload.organizationIds);
    });
  });
});
