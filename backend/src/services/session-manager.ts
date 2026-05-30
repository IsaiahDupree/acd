/**
 * Session Management Service
 * Handles session creation, validation, timeouts, and security
 */

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { auditLogger, AuditEventType, AuditSeverity } from './audit-logger';

const prisma = new PrismaClient();

// Session configuration from environment
const SESSION_CONFIG = {
  // Maximum session duration (absolute timeout)
  MAX_SESSION_DURATION: parseInt(process.env.SESSION_TIMEOUT || '3600', 10) * 1000, // ms

  // Idle timeout (no activity)
  IDLE_TIMEOUT: parseInt(process.env.SESSION_IDLE_TIMEOUT || '1800', 10) * 1000, // ms

  // Maximum concurrent sessions per user
  MAX_CONCURRENT_SESSIONS: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '5', 10),

  // Session refresh threshold (refresh if less than this time remaining)
  REFRESH_THRESHOLD: parseInt(process.env.SESSION_REFRESH_THRESHOLD || '900', 10) * 1000, // ms

  // JWT secret
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',
};

export interface SessionData {
  id: string;
  userId: string;
  userEmail: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  revoked: boolean;
}

export interface SessionToken {
  sessionId: string;
  userId: string;
  userEmail: string;
  iat: number;
  exp: number;
}

class SessionManager {
  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    userEmail: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{ token: string; session: SessionData }> {
    // Check concurrent session limit
    await this.enforceConcurrentSessionLimit(userId);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_CONFIG.MAX_SESSION_DURATION);

    // Create session record
    const session: SessionData = {
      id: this.generateSessionId(),
      userId,
      userEmail,
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
      ipAddress,
      userAgent,
      revoked: false,
    };

    // Store in database or cache (Redis recommended for production)
    // For now, we'll store in memory and log
    await this.storeSession(session);

    // Generate JWT token
    const token = this.generateToken(session);

    // Audit log
    await auditLogger.log({
      eventType: AuditEventType.SESSION_CREATED,
      severity: AuditSeverity.INFO,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      result: 'SUCCESS',
      message: `Session created for ${userEmail}`,
      metadata: {
        sessionId: session.id,
        expiresAt: session.expiresAt,
      },
    });

    return { token, session };
  }

  /**
   * Validate and refresh session
   */
  async validateSession(token: string, ipAddress?: string): Promise<SessionData | null> {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, SESSION_CONFIG.JWT_SECRET) as SessionToken;

      // Load session from storage
      const session = await this.getSession(decoded.sessionId);

      if (!session) {
        await auditLogger.log({
          eventType: AuditEventType.UNAUTHORIZED_ACCESS,
          severity: AuditSeverity.WARNING,
          userId: decoded.userId,
          ipAddress,
          result: 'FAILURE',
          message: 'Session not found',
        });
        return null;
      }

      // Check if session is revoked
      if (session.revoked) {
        await auditLogger.log({
          eventType: AuditEventType.UNAUTHORIZED_ACCESS,
          severity: AuditSeverity.WARNING,
          userId: session.userId,
          ipAddress,
          result: 'FAILURE',
          message: 'Session revoked',
        });
        return null;
      }

      // Check absolute timeout
      if (new Date() > session.expiresAt) {
        await this.expireSession(session.id, 'Absolute timeout reached');
        return null;
      }

      // Check idle timeout
      const idleTime = Date.now() - session.lastActivityAt.getTime();
      if (idleTime > SESSION_CONFIG.IDLE_TIMEOUT) {
        await this.expireSession(session.id, 'Idle timeout reached');
        return null;
      }

      // Update last activity
      session.lastActivityAt = new Date();
      await this.updateSession(session);

      return session;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        await auditLogger.log({
          eventType: AuditEventType.UNAUTHORIZED_ACCESS,
          severity: AuditSeverity.WARNING,
          ipAddress,
          result: 'FAILURE',
          message: 'Invalid JWT token',
          metadata: { error: error.message },
        });
      }
      return null;
    }
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string, reason?: string): Promise<void> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return;
    }

    session.revoked = true;
    await this.updateSession(session);

    await auditLogger.log({
      eventType: AuditEventType.SESSION_REVOKED,
      severity: AuditSeverity.WARNING,
      userId: session.userId,
      userEmail: session.userEmail,
      result: 'SUCCESS',
      message: `Session revoked: ${reason || 'User requested'}`,
      metadata: { sessionId, reason },
    });
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(userId: string, reason?: string): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    let count = 0;

    for (const session of sessions) {
      if (!session.revoked) {
        await this.revokeSession(session.id, reason);
        count++;
      }
    }

    await auditLogger.log({
      eventType: AuditEventType.SESSION_REVOKED,
      severity: AuditSeverity.WARNING,
      userId,
      result: 'SUCCESS',
      message: `Revoked ${count} sessions for user`,
      metadata: { count, reason },
    });

    return count;
  }

  /**
   * Expire a session
   */
  private async expireSession(sessionId: string, reason: string): Promise<void> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return;
    }

    session.revoked = true;
    await this.updateSession(session);

    await auditLogger.log({
      eventType: AuditEventType.SESSION_EXPIRED,
      severity: AuditSeverity.INFO,
      userId: session.userId,
      userEmail: session.userEmail,
      result: 'SUCCESS',
      message: `Session expired: ${reason}`,
      metadata: { sessionId, reason },
    });
  }

  /**
   * Enforce concurrent session limit
   */
  private async enforceConcurrentSessionLimit(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    const activeSessions = sessions.filter((s) => !s.revoked && new Date() < s.expiresAt);

    if (activeSessions.length >= SESSION_CONFIG.MAX_CONCURRENT_SESSIONS) {
      // Revoke oldest session(s)
      const sortedSessions = activeSessions.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );

      const sessionsToRevoke = sortedSessions.slice(
        0,
        activeSessions.length - SESSION_CONFIG.MAX_CONCURRENT_SESSIONS + 1
      );

      for (const session of sessionsToRevoke) {
        await this.revokeSession(session.id, 'Concurrent session limit reached');
      }
    }
  }

  /**
   * Check if session should be refreshed
   */
  shouldRefreshSession(session: SessionData): boolean {
    const timeRemaining = session.expiresAt.getTime() - Date.now();
    return timeRemaining < SESSION_CONFIG.REFRESH_THRESHOLD;
  }

  /**
   * Refresh session (extend expiration)
   */
  async refreshSession(sessionId: string): Promise<{ token: string; session: SessionData } | null> {
    const session = await this.getSession(sessionId);

    if (!session || session.revoked) {
      return null;
    }

    // Extend expiration
    const now = new Date();
    session.expiresAt = new Date(now.getTime() + SESSION_CONFIG.MAX_SESSION_DURATION);
    session.lastActivityAt = now;

    await this.updateSession(session);

    // Generate new token
    const token = this.generateToken(session);

    await auditLogger.log({
      eventType: AuditEventType.SESSION_CREATED,
      severity: AuditSeverity.INFO,
      userId: session.userId,
      userEmail: session.userEmail,
      result: 'SUCCESS',
      message: 'Session refreshed',
      metadata: { sessionId, newExpiresAt: session.expiresAt },
    });

    return { token, session };
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    // This would query database and delete expired sessions
    // For now, just return 0
    return 0;
  }

  /**
   * Get active session count for user
   */
  async getActiveSessionCount(userId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    return sessions.filter((s) => !s.revoked && new Date() < s.expiresAt).length;
  }

  // Storage methods (implement with Redis in production)
  private sessionStore = new Map<string, SessionData>();

  private async storeSession(session: SessionData): Promise<void> {
    this.sessionStore.set(session.id, session);
  }

  private async getSession(sessionId: string): Promise<SessionData | null> {
    return this.sessionStore.get(sessionId) || null;
  }

  private async updateSession(session: SessionData): Promise<void> {
    this.sessionStore.set(session.id, session);
  }

  private async getUserSessions(userId: string): Promise<SessionData[]> {
    return Array.from(this.sessionStore.values()).filter((s) => s.userId === userId);
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private generateToken(session: SessionData): string {
    const payload: SessionToken = {
      sessionId: session.id,
      userId: session.userId,
      userEmail: session.userEmail,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(session.expiresAt.getTime() / 1000),
    };

    return jwt.sign(payload, SESSION_CONFIG.JWT_SECRET);
  }
}

export const sessionManager = new SessionManager();
export { SESSION_CONFIG };
