/**
 * Session management middleware
 */

import { Request, Response, NextFunction } from 'express';
import { sessionManager, SESSION_CONFIG } from '../services/session-manager';

/**
 * Extend Express Request type
 */
declare global {
  namespace Express {
    interface Request {
      session?: any;
      user?: any;
    }
  }
}

/**
 * Validate session from Authorization header or cookie
 */
export async function validateSession(req: Request, res: Response, next: NextFunction) {
  try {
    // Get token from Authorization header or cookie
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: { message: 'No authentication token provided' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const session = await sessionManager.validateSession(token, ipAddress);

    if (!session) {
      res.status(401).json({ error: { message: 'Invalid or expired session' } });
      return;
    }

    // Attach session and user to request
    req.session = session;
    req.user = {
      id: session.userId,
      email: session.userEmail,
    };

    // Check if session should be refreshed
    if (sessionManager.shouldRefreshSession(session)) {
      const refreshed = await sessionManager.refreshSession(session.id);
      if (refreshed) {
        // Send new token in response header
        res.setHeader('X-New-Token', refreshed.token);
      }
    }

    next();
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ error: { message: 'Session validation failed' } });
  }
}

/**
 * Optional session validation (doesn't fail if no token)
 */
export async function optionalSession(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);

    if (token) {
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const session = await sessionManager.validateSession(token, ipAddress);

      if (session) {
        req.session = session;
        req.user = {
          id: session.userId,
          email: session.userEmail,
        };
      }
    }

    next();
  } catch (error) {
    // Don't fail for optional session
    next();
  }
}

/**
 * Require authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: { message: 'Authentication required' } });
    return;
  }

  next();
}

/**
 * Session activity tracking
 */
export function trackActivity(req: Request, res: Response, next: NextFunction) {
  if (req.session) {
    // Session is already updated in validateSession middleware
    // This is just a placeholder for additional tracking if needed
  }

  next();
}

/**
 * Extract token from request
 */
function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookie
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

/**
 * Logout handler
 */
export async function logout(req: Request, res: Response) {
  try {
    if (req.session) {
      await sessionManager.revokeSession(req.session.id, 'User logout');
    }

    res.json({ data: { success: true, message: 'Logged out successfully' } });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: { message: 'Logout failed' } });
  }
}

/**
 * Logout from all devices
 */
export async function logoutAll(req: Request, res: Response) {
  try {
    if (!req.user) {
      res.status(401).json({ error: { message: 'Authentication required' } });
      return;
    }

    const count = await sessionManager.revokeAllUserSessions(
      req.user.id,
      'User requested logout from all devices'
    );

    res.json({
      data: {
        success: true,
        message: `Logged out from ${count} devices`,
        count,
      },
    });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ error: { message: 'Logout failed' } });
  }
}

/**
 * Get active sessions for user
 */
export async function getActiveSessions(req: Request, res: Response) {
  try {
    if (!req.user) {
      res.status(401).json({ error: { message: 'Authentication required' } });
      return;
    }

    const count = await sessionManager.getActiveSessionCount(req.user.id);

    res.json({
      data: {
        count,
        max: SESSION_CONFIG.MAX_CONCURRENT_SESSIONS || 5,
      },
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: { message: 'Failed to get sessions' } });
  }
}
