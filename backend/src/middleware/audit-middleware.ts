/**
 * Express middleware for automatic audit logging
 */

import { Request, Response, NextFunction } from 'express';
import { auditLogger, AuditEventType, AuditSeverity, auditHelpers } from '../services/audit-logger';

/**
 * Audit all HTTP requests
 */
export function auditHttpRequests(req: Request, res: Response, next: NextFunction) {
  // Store request start time
  const startTime = Date.now();

  // Capture response
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    const duration = Date.now() - startTime;

    // Log based on status code
    if (res.statusCode >= 400) {
      auditLogger.log({
        eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
        severity: res.statusCode >= 500 ? AuditSeverity.ERROR : AuditSeverity.WARNING,
        userId: (req as any).user?.id,
        userEmail: (req as any).user?.email,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
        resource: req.path,
        action: req.method,
        result: 'FAILURE',
        message: `HTTP ${res.statusCode} ${req.method} ${req.path}`,
        metadata: {
          statusCode: res.statusCode,
          duration,
          query: req.query,
        },
      });
    }

    return originalJson(body);
  };

  next();
}

/**
 * Audit authentication events
 */
export function auditAuthEvents(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    // Login
    if (req.path === '/api/auth/login' || req.path === '/api/auth/signin') {
      if (res.statusCode === 200 && body.data?.user) {
        auditHelpers.loginSuccess(
          body.data.user.id,
          body.data.user.email,
          ipAddress,
          userAgent
        );
      } else if (res.statusCode >= 400) {
        const email = req.body?.email || 'unknown';
        const reason = body.error?.message || 'Unknown error';
        auditHelpers.loginFailure(email, ipAddress, userAgent, reason);
      }
    }

    // Logout
    if (req.path === '/api/auth/logout') {
      const user = (req as any).user;
      if (user) {
        auditHelpers.logout(user.id, user.email);
      }
    }

    // Password reset
    if (req.path === '/api/auth/reset-password') {
      auditLogger.log({
        eventType: AuditEventType.PASSWORD_RESET_REQUEST,
        severity: AuditSeverity.WARNING,
        userEmail: req.body?.email,
        ipAddress,
        userAgent,
        result: res.statusCode === 200 ? 'SUCCESS' : 'FAILURE',
        message: `Password reset requested for ${req.body?.email}`,
      });
    }

    return originalJson(body);
  };

  next();
}

/**
 * Audit data access events
 */
export function auditDataAccess(req: Request, res: Response, next: NextFunction) {
  // Only audit sensitive routes
  const piiRoutes = ['/api/users', '/api/profile', '/api/api-tokens'];
  const isPiiRoute = piiRoutes.some((route) => req.path.startsWith(route));

  if (!isPiiRoute) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    const user = (req as any).user;

    if (user && res.statusCode === 200) {
      const resourceId = req.params.id || req.params.userId || 'unknown';

      auditHelpers.piiAccess(
        user.id,
        req.path,
        resourceId,
        req.method
      );
    }

    return originalJson(body);
  };

  next();
}

/**
 * Audit security events (rate limiting, CSRF, etc.)
 */
export function auditSecurityEvents(req: Request, res: Response, next: NextFunction) {
  // This is called by other middleware when security issues are detected
  next();
}

/**
 * Audit admin actions
 */
export function auditAdminActions(req: Request, res: Response, next: NextFunction) {
  const adminRoutes = [
    '/api/admin',
    '/api/organizations/:id/settings',
    '/api/users/:id/role',
  ];

  const isAdminRoute = adminRoutes.some((route) =>
    req.path.match(new RegExp(route.replace(':id', '[^/]+')))
  );

  if (!isAdminRoute) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    const user = (req as any).user;

    if (user) {
      auditLogger.log({
        eventType: AuditEventType.SETTINGS_CHANGED,
        severity: AuditSeverity.WARNING,
        userId: user.id,
        userEmail: user.email,
        resource: req.path,
        action: req.method,
        result: res.statusCode === 200 ? 'SUCCESS' : 'FAILURE',
        message: `Admin action: ${req.method} ${req.path}`,
        metadata: {
          body: req.body,
          params: req.params,
        },
      });
    }

    return originalJson(body);
  };

  next();
}
