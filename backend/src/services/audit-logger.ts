/**
 * Audit Logging Service
 * Logs security-relevant events for compliance and security monitoring
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  MFA_ENABLED = 'MFA_ENABLED',
  MFA_DISABLED = 'MFA_DISABLED',

  // Session events
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_REVOKED = 'SESSION_REVOKED',

  // Data access events
  USER_VIEWED = 'USER_VIEWED',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  PII_ACCESSED = 'PII_ACCESSED',
  PII_EXPORTED = 'PII_EXPORTED',

  // Admin actions
  ROLE_CHANGED = 'ROLE_CHANGED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  SETTINGS_CHANGED = 'SETTINGS_CHANGED',

  // API token events
  API_TOKEN_CREATED = 'API_TOKEN_CREATED',
  API_TOKEN_REVOKED = 'API_TOKEN_REVOKED',
  API_TOKEN_USED = 'API_TOKEN_USED',

  // Security events
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  CSRF_DETECTED = 'CSRF_DETECTED',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',

  // GDPR events
  GDPR_DATA_EXPORT = 'GDPR_DATA_EXPORT',
  GDPR_DATA_DELETION = 'GDPR_DATA_DELETION',
  GDPR_CONSENT_GIVEN = 'GDPR_CONSENT_GIVEN',
  GDPR_CONSENT_REVOKED = 'GDPR_CONSENT_REVOKED',
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export interface AuditLogEntry {
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
  action?: string;
  result: 'SUCCESS' | 'FAILURE';
  metadata?: Record<string, any>;
  message?: string;
}

/**
 * Audit logger class
 */
class AuditLogger {
  private logDir: string;
  private rotationSize: number = 10 * 1024 * 1024; // 10MB per file
  private maxFiles: number = 100;

  constructor() {
    this.logDir = process.env.AUDIT_LOG_DIR || path.join(process.cwd(), 'logs', 'audit');
    this.ensureLogDirSync();
  }

  /**
   * Ensure audit log directory exists
   */
  private ensureLogDirSync() {
    try {
      const fsSync = require('fs');
      fsSync.mkdirSync(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create audit log directory:', error);
    }
  }

  private async ensureLogDir() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create audit log directory:', error);
    }
  }

  /**
   * Log an audit event
   */
  async log(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date(),
    };

    // Log to multiple destinations in parallel
    await Promise.all([
      this.logToFile(fullEntry),
      this.logToDatabase(fullEntry),
      this.logToConsole(fullEntry),
    ]).catch((error) => {
      // Critical: if audit logging fails, we should know
      console.error('CRITICAL: Audit logging failed:', error);
    });
  }

  /**
   * Log to file (for compliance and backup)
   */
  private async logToFile(entry: AuditLogEntry): Promise<void> {
    try {
      const filename = `audit-${new Date().toISOString().split('T')[0]}.jsonl`;
      const filepath = path.join(this.logDir, filename);
      const line = JSON.stringify(entry) + '\n';

      await fs.appendFile(filepath, line, 'utf8');

      // Check file size and rotate if needed
      const stats = await fs.stat(filepath);
      if (stats.size > this.rotationSize) {
        await this.rotateLog(filepath);
      }
    } catch (error) {
      console.error('Failed to log audit event to file:', error);
    }
  }

  /**
   * Log to database (for querying and analysis)
   */
  private async logToDatabase(entry: AuditLogEntry): Promise<void> {
    try {
      // Store in database for easy querying
      // You can create a separate AuditLog table in Prisma schema
      // For now, we'll just demonstrate the structure

      // await prisma.auditLog.create({
      //   data: {
      //     timestamp: entry.timestamp,
      //     eventType: entry.eventType,
      //     severity: entry.severity,
      //     userId: entry.userId,
      //     userEmail: entry.userEmail,
      //     ipAddress: entry.ipAddress,
      //     userAgent: entry.userAgent,
      //     resource: entry.resource,
      //     resourceId: entry.resourceId,
      //     action: entry.action,
      //     result: entry.result,
      //     metadata: entry.metadata || {},
      //     message: entry.message,
      //   },
      // });
    } catch (error) {
      console.error('Failed to log audit event to database:', error);
    }
  }

  /**
   * Log to console (for development)
   */
  private logToConsole(entry: AuditLogEntry): void {
    const { timestamp, eventType, severity, userId, userEmail, result, message } = entry;

    const logLevel = severity === AuditSeverity.CRITICAL || severity === AuditSeverity.ERROR
      ? 'error'
      : severity === AuditSeverity.WARNING
      ? 'warn'
      : 'log';

    console[logLevel]('[AUDIT]', {
      timestamp: timestamp.toISOString(),
      event: eventType,
      severity,
      user: userEmail || userId || 'anonymous',
      result,
      message,
    });
  }

  /**
   * Rotate log file when it gets too large
   */
  private async rotateLog(filepath: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const rotatedPath = filepath.replace('.jsonl', `.${timestamp}.jsonl`);
      await fs.rename(filepath, rotatedPath);

      // Clean up old log files
      await this.cleanupOldLogs();
    } catch (error) {
      console.error('Failed to rotate audit log:', error);
    }
  }

  /**
   * Clean up old log files to prevent disk space issues
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const auditFiles = files
        .filter((f) => f.startsWith('audit-') && f.endsWith('.jsonl'))
        .sort()
        .reverse();

      // Keep only the most recent files
      const filesToDelete = auditFiles.slice(this.maxFiles);

      for (const file of filesToDelete) {
        await fs.unlink(path.join(this.logDir, file));
      }
    } catch (error) {
      console.error('Failed to cleanup old audit logs:', error);
    }
  }

  /**
   * Query audit logs
   */
  async query(filters: {
    eventType?: AuditEventType;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    severity?: AuditSeverity;
    result?: 'SUCCESS' | 'FAILURE';
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    // This would query the database
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Get audit statistics
   */
  async getStats(timeRange: { start: Date; end: Date }): Promise<{
    totalEvents: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    failedAttempts: number;
    suspiciousActivity: number;
  }> {
    // This would aggregate from database
    return {
      totalEvents: 0,
      byType: {},
      bySeverity: {},
      failedAttempts: 0,
      suspiciousActivity: 0,
    };
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();

/**
 * Helper functions for common audit events
 */
export const auditHelpers = {
  loginSuccess(userId: string, userEmail: string, ipAddress: string, userAgent: string) {
    return auditLogger.log({
      eventType: AuditEventType.LOGIN_SUCCESS,
      severity: AuditSeverity.INFO,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      result: 'SUCCESS',
      message: `User ${userEmail} logged in successfully`,
    });
  },

  loginFailure(email: string, ipAddress: string, userAgent: string, reason: string) {
    return auditLogger.log({
      eventType: AuditEventType.LOGIN_FAILURE,
      severity: AuditSeverity.WARNING,
      userEmail: email,
      ipAddress,
      userAgent,
      result: 'FAILURE',
      message: `Login failed for ${email}: ${reason}`,
      metadata: { reason },
    });
  },

  logout(userId: string, userEmail: string) {
    return auditLogger.log({
      eventType: AuditEventType.LOGOUT,
      severity: AuditSeverity.INFO,
      userId,
      userEmail,
      result: 'SUCCESS',
      message: `User ${userEmail} logged out`,
    });
  },

  piiAccess(userId: string, resource: string, resourceId: string, action: string) {
    return auditLogger.log({
      eventType: AuditEventType.PII_ACCESSED,
      severity: AuditSeverity.INFO,
      userId,
      resource,
      resourceId,
      action,
      result: 'SUCCESS',
      message: `PII accessed: ${resource}/${resourceId}`,
    });
  },

  unauthorizedAccess(userId: string | undefined, resource: string, ipAddress: string, userAgent: string) {
    return auditLogger.log({
      eventType: AuditEventType.UNAUTHORIZED_ACCESS,
      severity: AuditSeverity.WARNING,
      userId,
      resource,
      ipAddress,
      userAgent,
      result: 'FAILURE',
      message: `Unauthorized access attempt to ${resource}`,
    });
  },

  rateLimitExceeded(userId: string | undefined, ipAddress: string, endpoint: string) {
    return auditLogger.log({
      eventType: AuditEventType.RATE_LIMIT_EXCEEDED,
      severity: AuditSeverity.WARNING,
      userId,
      ipAddress,
      resource: endpoint,
      result: 'FAILURE',
      message: `Rate limit exceeded for ${endpoint}`,
    });
  },

  gdprDataExport(userId: string, userEmail: string) {
    return auditLogger.log({
      eventType: AuditEventType.GDPR_DATA_EXPORT,
      severity: AuditSeverity.INFO,
      userId,
      userEmail,
      result: 'SUCCESS',
      message: `GDPR data export requested by ${userEmail}`,
    });
  },

  gdprDataDeletion(userId: string, userEmail: string) {
    return auditLogger.log({
      eventType: AuditEventType.GDPR_DATA_DELETION,
      severity: AuditSeverity.CRITICAL,
      userId,
      userEmail,
      result: 'SUCCESS',
      message: `GDPR data deletion completed for ${userEmail}`,
    });
  },

  suspiciousActivity(userId: string | undefined, ipAddress: string, activity: string, metadata?: any) {
    return auditLogger.log({
      eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
      severity: AuditSeverity.ERROR,
      userId,
      ipAddress,
      result: 'FAILURE',
      message: `Suspicious activity detected: ${activity}`,
      metadata,
    });
  },
};
