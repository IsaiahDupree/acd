/**
 * Tests for session manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sessionManager, SESSION_CONFIG } from '../services/session-manager';

describe('Session Manager', () => {
  beforeEach(() => {
    // Clear session store before each test
    sessionManager['sessionStore'].clear();

    // Set test environment variables
    process.env.SESSION_TIMEOUT = '3600';
    process.env.SESSION_IDLE_TIMEOUT = '1800';
    process.env.MAX_CONCURRENT_SESSIONS = '5';
    process.env.JWT_SECRET = 'test-secret-key';
  });

  describe('Session Creation', () => {
    it('should create a session successfully', async () => {
      const { token, session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(token).toBeTruthy();
      expect(session.userId).toBe('user-123');
      expect(session.userEmail).toBe('test@example.com');
      expect(session.revoked).toBe(false);
    });

    it('should set expiration time correctly', async () => {
      const { session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      const expectedExpiration = new Date(
        session.createdAt.getTime() + SESSION_CONFIG.MAX_SESSION_DURATION
      );

      expect(session.expiresAt.getTime()).toBeCloseTo(
        expectedExpiration.getTime(),
        -3 // Within 1000ms
      );
    });

    it('should track session creation metadata', async () => {
      const { session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '192.168.1.1',
        'Chrome/100.0'
      );

      expect(session.ipAddress).toBe('192.168.1.1');
      expect(session.userAgent).toBe('Chrome/100.0');
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivityAt).toBeInstanceOf(Date);
    });
  });

  describe('Session Validation', () => {
    it('should validate a valid session', async () => {
      const { token } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      const validated = await sessionManager.validateSession(token, '127.0.0.1');

      expect(validated).toBeTruthy();
      expect(validated?.userId).toBe('user-123');
    });

    it('should reject invalid token', async () => {
      const validated = await sessionManager.validateSession(
        'invalid-token',
        '127.0.0.1'
      );

      expect(validated).toBeNull();
    });

    it('should reject revoked session', async () => {
      const { token, session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      await sessionManager.revokeSession(session.id);

      const validated = await sessionManager.validateSession(token, '127.0.0.1');

      expect(validated).toBeNull();
    });

    it('should update last activity time on validation', async () => {
      const { token, session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      const originalActivity = session.lastActivityAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      await sessionManager.validateSession(token, '127.0.0.1');

      const updatedSession = await sessionManager['getSession'](session.id);
      expect(updatedSession?.lastActivityAt.getTime()).toBeGreaterThan(
        originalActivity.getTime()
      );
    });
  });

  describe('Session Timeouts', () => {
    it('should enforce absolute timeout', async () => {
      const { token, session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      // Manually expire the session
      session.expiresAt = new Date(Date.now() - 1000);
      await sessionManager['updateSession'](session);

      const validated = await sessionManager.validateSession(token, '127.0.0.1');

      expect(validated).toBeNull();
    });

    it('should enforce idle timeout', async () => {
      // Set very short idle timeout for testing
      const originalConfig = SESSION_CONFIG.IDLE_TIMEOUT;
      (SESSION_CONFIG as any).IDLE_TIMEOUT = 100; // 100ms

      const { token, session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      // Wait longer than idle timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      const validated = await sessionManager.validateSession(token, '127.0.0.1');

      expect(validated).toBeNull();

      // Restore original config
      (SESSION_CONFIG as any).IDLE_TIMEOUT = originalConfig;
    });
  });

  describe('Concurrent Session Limit', () => {
    it('should enforce max concurrent sessions', async () => {
      const userId = 'user-123';
      const maxSessions = SESSION_CONFIG.MAX_CONCURRENT_SESSIONS;

      // Create max sessions
      const sessions = [];
      for (let i = 0; i < maxSessions; i++) {
        const { session } = await sessionManager.createSession(
          userId,
          'test@example.com',
          '127.0.0.1',
          `Browser-${i}`
        );
        sessions.push(session);
      }

      // Create one more session (should revoke oldest)
      await sessionManager.createSession(
        userId,
        'test@example.com',
        '127.0.0.1',
        'Browser-new'
      );

      // Check that oldest session is revoked
      const oldestSession = await sessionManager['getSession'](sessions[0].id);
      expect(oldestSession?.revoked).toBe(true);

      // Check active session count
      const activeCount = await sessionManager.getActiveSessionCount(userId);
      expect(activeCount).toBe(maxSessions);
    });
  });

  describe('Session Revocation', () => {
    it('should revoke a single session', async () => {
      const { session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      await sessionManager.revokeSession(session.id, 'Test revocation');

      const updatedSession = await sessionManager['getSession'](session.id);
      expect(updatedSession?.revoked).toBe(true);
    });

    it('should revoke all user sessions', async () => {
      const userId = 'user-123';

      // Create multiple sessions
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const { session } = await sessionManager.createSession(
          userId,
          'test@example.com',
          '127.0.0.1',
          `Browser-${i}`
        );
        sessions.push(session);
      }

      // Revoke all
      const count = await sessionManager.revokeAllUserSessions(
        userId,
        'Security measure'
      );

      expect(count).toBe(3);

      // Verify all are revoked
      for (const session of sessions) {
        const updated = await sessionManager['getSession'](session.id);
        expect(updated?.revoked).toBe(true);
      }
    });
  });

  describe('Session Refresh', () => {
    it('should refresh a valid session', async () => {
      const { session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      const originalExpiry = session.expiresAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const refreshed = await sessionManager.refreshSession(session.id);

      expect(refreshed).toBeTruthy();
      expect(refreshed?.session.expiresAt.getTime()).toBeGreaterThan(
        originalExpiry.getTime()
      );
    });

    it('should not refresh revoked session', async () => {
      const { session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      await sessionManager.revokeSession(session.id);

      const refreshed = await sessionManager.refreshSession(session.id);

      expect(refreshed).toBeNull();
    });

    it('should detect when refresh is needed', async () => {
      const { session } = await sessionManager.createSession(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      // Set expiry close to threshold
      session.expiresAt = new Date(
        Date.now() + SESSION_CONFIG.REFRESH_THRESHOLD - 100
      );
      await sessionManager['updateSession'](session);

      expect(sessionManager.shouldRefreshSession(session)).toBe(true);
    });
  });

  describe('Session Queries', () => {
    it('should get active session count', async () => {
      const userId = 'user-123';

      await sessionManager.createSession(userId, 'test@example.com', '127.0.0.1', 'Browser-1');
      await sessionManager.createSession(userId, 'test@example.com', '127.0.0.1', 'Browser-2');

      const count = await sessionManager.getActiveSessionCount(userId);

      expect(count).toBe(2);
    });

    it('should not count revoked sessions', async () => {
      const userId = 'user-123';

      const { session: session1 } = await sessionManager.createSession(
        userId,
        'test@example.com',
        '127.0.0.1',
        'Browser-1'
      );
      await sessionManager.createSession(userId, 'test@example.com', '127.0.0.1', 'Browser-2');

      // Revoke one session
      await sessionManager.revokeSession(session1.id);

      const count = await sessionManager.getActiveSessionCount(userId);

      expect(count).toBe(1);
    });
  });
});
