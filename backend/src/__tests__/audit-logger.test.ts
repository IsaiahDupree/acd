/**
 * Tests for audit logging
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

describe('Audit Logger', () => {
  const testLogDir = path.join(process.cwd(), 'logs', 'audit-test');

  let AuditEventType: any;
  let AuditSeverity: any;
  let auditLogger: any;
  let auditHelpers: any;

  beforeAll(async () => {
    // Set env BEFORE module load so singleton uses correct path
    process.env.AUDIT_LOG_DIR = testLogDir;
    vi.resetModules();
    const module = await import('../services/audit-logger');
    auditLogger = module.auditLogger;
    auditHelpers = module.auditHelpers;
    AuditEventType = module.AuditEventType;
    AuditSeverity = module.AuditSeverity;
  });

  beforeEach(async () => {
    // Clean up test logs before each test
    try {
      await fs.rm(testLogDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore if doesn't exist
    }

    // Recreate directory
    await fs.mkdir(testLogDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test logs
    try {
      await fs.rm(testLogDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
  });

  describe('Basic Logging', () => {
    it('should log audit events to file', async () => {
      await auditLogger.log({
        eventType: AuditEventType.LOGIN_SUCCESS,
        severity: AuditSeverity.INFO,
        userId: 'user-123',
        userEmail: 'test@example.com',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        result: 'SUCCESS',
        message: 'User logged in',
      });

      // Wait for file write
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if log file was created
      const files = await fs.readdir(testLogDir);
      expect(files.length).toBeGreaterThan(0);

      const logFile = files.find((f) => f.startsWith('audit-'));
      expect(logFile).toBeTruthy();

      // Read log content
      const content = await fs.readFile(
        path.join(testLogDir, logFile!),
        'utf8'
      );
      const logEntry = JSON.parse(content.trim());

      expect(logEntry.eventType).toBe('LOGIN_SUCCESS');
      expect(logEntry.userId).toBe('user-123');
      expect(logEntry.userEmail).toBe('test@example.com');
    });

    it('should include timestamp in log entry', async () => {
      await auditLogger.log({
        eventType: AuditEventType.LOGOUT,
        severity: AuditSeverity.INFO,
        userId: 'user-123',
        result: 'SUCCESS',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const logFile = files[0];
      const content = await fs.readFile(
        path.join(testLogDir, logFile),
        'utf8'
      );
      const logEntry = JSON.parse(content.trim());

      expect(logEntry.timestamp).toBeTruthy();
      expect(new Date(logEntry.timestamp)).toBeInstanceOf(Date);
    });

    it('should handle multiple log entries', async () => {
      await Promise.all([
        auditLogger.log({
          eventType: AuditEventType.LOGIN_SUCCESS,
          severity: AuditSeverity.INFO,
          userId: 'user-1',
          result: 'SUCCESS',
        }),
        auditLogger.log({
          eventType: AuditEventType.LOGIN_SUCCESS,
          severity: AuditSeverity.INFO,
          userId: 'user-2',
          result: 'SUCCESS',
        }),
        auditLogger.log({
          eventType: AuditEventType.LOGIN_FAILURE,
          severity: AuditSeverity.WARNING,
          userEmail: 'user-3@test.com',
          result: 'FAILURE',
        }),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const content = await fs.readFile(
        path.join(testLogDir, files[0]),
        'utf8'
      );
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(3);
    });
  });

  describe('Audit Helpers', () => {
    it('should log login success', async () => {
      await auditHelpers.loginSuccess(
        'user-123',
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const content = await fs.readFile(
        path.join(testLogDir, files[0]),
        'utf8'
      );
      const logEntry = JSON.parse(content.trim());

      expect(logEntry.eventType).toBe('LOGIN_SUCCESS');
      expect(logEntry.severity).toBe('INFO');
      expect(logEntry.result).toBe('SUCCESS');
    });

    it('should log login failure', async () => {
      await auditHelpers.loginFailure(
        'test@example.com',
        '127.0.0.1',
        'Mozilla/5.0',
        'Invalid password'
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const content = await fs.readFile(
        path.join(testLogDir, files[0]),
        'utf8'
      );
      const logEntry = JSON.parse(content.trim());

      expect(logEntry.eventType).toBe('LOGIN_FAILURE');
      expect(logEntry.severity).toBe('WARNING');
      expect(logEntry.result).toBe('FAILURE');
      expect(logEntry.metadata.reason).toBe('Invalid password');
    });

    it('should log PII access', async () => {
      await auditHelpers.piiAccess(
        'user-123',
        '/api/users',
        'user-456',
        'GET'
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const content = await fs.readFile(
        path.join(testLogDir, files[0]),
        'utf8'
      );
      const logEntry = JSON.parse(content.trim());

      expect(logEntry.eventType).toBe('PII_ACCESSED');
      expect(logEntry.resource).toBe('/api/users');
      expect(logEntry.resourceId).toBe('user-456');
      expect(logEntry.action).toBe('GET');
    });

    it('should log unauthorized access', async () => {
      await auditHelpers.unauthorizedAccess(
        'user-123',
        '/api/admin',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const content = await fs.readFile(
        path.join(testLogDir, files[0]),
        'utf8'
      );
      const logEntry = JSON.parse(content.trim());

      expect(logEntry.eventType).toBe('UNAUTHORIZED_ACCESS');
      expect(logEntry.severity).toBe('WARNING');
      expect(logEntry.result).toBe('FAILURE');
    });

    it('should log GDPR events', async () => {
      await auditHelpers.gdprDataExport('user-123', 'test@example.com');
      await auditHelpers.gdprDataDeletion('user-123', 'test@example.com');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const content = await fs.readFile(
        path.join(testLogDir, files[0]),
        'utf8'
      );
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(2);

      const exportEntry = JSON.parse(lines[0]);
      const deletionEntry = JSON.parse(lines[1]);

      expect(exportEntry.eventType).toBe('GDPR_DATA_EXPORT');
      expect(deletionEntry.eventType).toBe('GDPR_DATA_DELETION');
      expect(deletionEntry.severity).toBe('CRITICAL');
    });
  });

  describe('Security Events', () => {
    it('should log rate limit exceeded', async () => {
      await auditHelpers.rateLimitExceeded(
        'user-123',
        '127.0.0.1',
        '/api/auth/login'
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const content = await fs.readFile(
        path.join(testLogDir, files[0]),
        'utf8'
      );
      const logEntry = JSON.parse(content.trim());

      expect(logEntry.eventType).toBe('RATE_LIMIT_EXCEEDED');
      expect(logEntry.severity).toBe('WARNING');
    });

    it('should log suspicious activity', async () => {
      await auditHelpers.suspiciousActivity(
        'user-123',
        '127.0.0.1',
        'Multiple failed login attempts',
        { attempts: 5 }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const content = await fs.readFile(
        path.join(testLogDir, files[0]),
        'utf8'
      );
      const logEntry = JSON.parse(content.trim());

      expect(logEntry.eventType).toBe('SUSPICIOUS_ACTIVITY');
      expect(logEntry.severity).toBe('ERROR');
      expect(logEntry.metadata.attempts).toBe(5);
    });
  });

  describe('Log Format', () => {
    it('should store logs in JSONL format', async () => {
      await auditLogger.log({
        eventType: AuditEventType.LOGIN_SUCCESS,
        severity: AuditSeverity.INFO,
        userId: 'user-1',
        result: 'SUCCESS',
      });

      await auditLogger.log({
        eventType: AuditEventType.LOGOUT,
        severity: AuditSeverity.INFO,
        userId: 'user-1',
        result: 'SUCCESS',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const content = await fs.readFile(
        path.join(testLogDir, files[0]),
        'utf8'
      );
      const lines = content.trim().split('\n');

      // Each line should be valid JSON
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });

    it('should use ISO 8601 timestamps', async () => {
      await auditLogger.log({
        eventType: AuditEventType.LOGIN_SUCCESS,
        severity: AuditSeverity.INFO,
        userId: 'user-1',
        result: 'SUCCESS',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await fs.readdir(testLogDir);
      const content = await fs.readFile(
        path.join(testLogDir, files[0]),
        'utf8'
      );
      const logEntry = JSON.parse(content.trim());

      // ISO 8601 format
      expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
