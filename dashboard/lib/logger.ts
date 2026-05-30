/**
 * Centralized Logging System (CF-WC-107)
 *
 * Structured logging with context enrichment and log aggregation.
 */

import { env } from './env-config';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

const logLevelMap: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  fatal: LogLevel.FATAL,
};

interface LogContext {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  environment: string;
  [key: string]: any;
}

class Logger {
  private minLevel: LogLevel;
  private context: Record<string, any> = {};

  constructor() {
    this.minLevel = logLevelMap[env.LOG_LEVEL] || LogLevel.INFO;
  }

  setContext(context: Record<string, any>) {
    this.context = { ...this.context, ...context };
  }

  clearContext() {
    this.context = {};
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private formatLog(level: string, message: string, meta?: Record<string, any>): LogContext {
    const log: LogContext = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'acd-dashboard',
      environment: env.NODE_ENV,
      ...this.context,
      ...meta,
    };

    return log;
  }

  private output(log: LogContext) {
    if (env.LOG_FORMAT === 'json') {
      console.log(JSON.stringify(log));
    } else {
      const { timestamp, level, message, ...rest } = log;
      const emoji = this.getLevelEmoji(level);
      console.log(
        `${emoji} [${timestamp}] ${level.toUpperCase()}: ${message}`,
        Object.keys(rest).length > 0 ? rest : ''
      );
    }
  }

  private getLevelEmoji(level: string): string {
    const emojis: Record<string, string> = {
      debug: '🐛',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      fatal: '💀',
    };
    return emojis[level] || 'ℹ️';
  }

  debug(message: string, meta?: Record<string, any>) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.output(this.formatLog('debug', message, meta));
    }
  }

  info(message: string, meta?: Record<string, any>) {
    if (this.shouldLog(LogLevel.INFO)) {
      this.output(this.formatLog('info', message, meta));
    }
  }

  warn(message: string, meta?: Record<string, any>) {
    if (this.shouldLog(LogLevel.WARN)) {
      this.output(this.formatLog('warn', message, meta));
    }
  }

  error(message: string, error?: Error, meta?: Record<string, any>) {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorMeta = error
        ? {
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
          }
        : {};

      this.output(this.formatLog('error', message, { ...errorMeta, ...meta }));
    }
  }

  fatal(message: string, error?: Error, meta?: Record<string, any>) {
    if (this.shouldLog(LogLevel.FATAL)) {
      const errorMeta = error
        ? {
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
          }
        : {};

      this.output(this.formatLog('fatal', message, { ...errorMeta, ...meta }));
    }
  }

  // HTTP request logging
  logRequest(req: any, res: any, duration: number) {
    this.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress,
    });
  }

  // Database query logging
  logQuery(query: string, duration: number, params?: any[]) {
    this.debug('Database Query', {
      query,
      duration,
      params,
    });
  }

  // Performance logging
  logPerformance(operation: string, duration: number, metadata?: Record<string, any>) {
    this.info('Performance Metric', {
      operation,
      duration,
      ...metadata,
    });
  }
}

// Export singleton instance
export const logger = new Logger();

// Express middleware for request logging
export function requestLogger(req: any, res: any, next: any) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });

  next();
}

// Utility to measure function execution time
export async function measureTime<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logger.logPerformance(operation, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`Operation failed: ${operation}`, error as Error, { duration });
    throw error;
  }
}
