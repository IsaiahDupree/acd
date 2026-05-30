/**
 * Uptime Monitoring Integration (CF-WC-114)
 *
 * Integrates with external uptime monitoring services (UptimeRobot, Pingdom, etc.)
 * and provides internal heartbeat monitoring.
 */

import { env } from './env-config';
import { logger } from './logger';

export interface UptimeCheck {
  name: string;
  url: string;
  interval: number; // in seconds
  timeout: number; // in milliseconds
  expectedStatus?: number;
  lastCheck?: Date;
  status: 'up' | 'down' | 'degraded';
}

class UptimeMonitor {
  private checks: Map<string, UptimeCheck> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.initializeDefaultChecks();
  }

  private initializeDefaultChecks() {
    // Add default health checks
    this.addCheck({
      name: 'API Health',
      url: `${env.NEXT_PUBLIC_API_URL}/api/health`,
      interval: 60,
      timeout: 5000,
      expectedStatus: 200,
      status: 'up',
    });

    if (env.REMOTION_API_URL) {
      this.addCheck({
        name: 'Remotion API',
        url: `${env.REMOTION_API_URL}/health`,
        interval: 300,
        timeout: 10000,
        expectedStatus: 200,
        status: 'up',
      });
    }
  }

  addCheck(check: UptimeCheck) {
    this.checks.set(check.name, check);
    this.startMonitoring(check.name);
    logger.info('Uptime check added', { name: check.name, url: check.url });
  }

  removeCheck(name: string) {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
    this.checks.delete(name);
    logger.info('Uptime check removed', { name });
  }

  private startMonitoring(name: string) {
    const check = this.checks.get(name);
    if (!check) return;

    // Clear existing interval if any
    const existingInterval = this.intervals.get(name);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Set up new interval
    const interval = setInterval(async () => {
      await this.performCheck(name);
    }, check.interval * 1000);

    this.intervals.set(name, interval);

    // Perform initial check
    this.performCheck(name);
  }

  private async performCheck(name: string) {
    const check = this.checks.get(name);
    if (!check) return;

    const startTime = Date.now();

    try {
      const response = await fetch(check.url, {
        method: 'GET',
        signal: AbortSignal.timeout(check.timeout),
      });

      const responseTime = Date.now() - startTime;
      const isExpectedStatus = check.expectedStatus
        ? response.status === check.expectedStatus
        : response.ok;

      if (isExpectedStatus) {
        // Service is up
        if (check.status !== 'up') {
          logger.info('Service recovered', {
            name,
            url: check.url,
            responseTime,
          });
          this.notifyStatusChange(name, 'down', 'up');
        }

        check.status = 'up';
        check.lastCheck = new Date();
      } else {
        // Service is degraded
        if (check.status !== 'degraded') {
          logger.warn('Service degraded', {
            name,
            url: check.url,
            status: response.status,
            expectedStatus: check.expectedStatus,
          });
          this.notifyStatusChange(name, check.status, 'degraded');
        }

        check.status = 'degraded';
        check.lastCheck = new Date();
      }
    } catch (error) {
      // Service is down
      if (check.status !== 'down') {
        logger.error('Service down', error as Error, {
          name,
          url: check.url,
        });
        this.notifyStatusChange(name, check.status, 'down');
      }

      check.status = 'down';
      check.lastCheck = new Date();
    }

    this.checks.set(name, check);
  }

  private notifyStatusChange(
    name: string,
    oldStatus: string,
    newStatus: string
  ) {
    // Send notifications via configured channels
    logger.info('Uptime status changed', { name, oldStatus, newStatus });

    // Could integrate with:
    // - Slack webhooks
    // - Email alerts
    // - PagerDuty
    // - Discord webhooks
    // - SMS via Twilio
  }

  getStatus(name: string): UptimeCheck | undefined {
    return this.checks.get(name);
  }

  getAllStatuses(): UptimeCheck[] {
    return Array.from(this.checks.values());
  }

  stopAll() {
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();
  }
}

// Singleton instance
export const uptimeMonitor = new UptimeMonitor();

// Heartbeat function for external monitoring services
export async function sendHeartbeat(monitorId?: string) {
  if (!monitorId) {
    logger.debug('No uptime monitor ID configured');
    return;
  }

  try {
    // Example: UptimeRobot heartbeat
    await fetch(`https://heartbeat.uptimerobot.com/${monitorId}`, {
      method: 'GET',
    });

    logger.debug('Heartbeat sent', { monitorId });
  } catch (error) {
    logger.error('Failed to send heartbeat', error as Error, { monitorId });
  }
}

// Initialize monitoring on app start
if (env.NODE_ENV === 'production') {
  logger.info('Uptime monitoring initialized');
}
