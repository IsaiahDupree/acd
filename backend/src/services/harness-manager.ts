/**
 * Harness Manager Service
 * 
 * Manages agent harness processes - starting, stopping, monitoring,
 * and streaming logs from autonomous coding sessions.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import Redis from 'ioredis';
import { getScheduler, TaskScheduler } from './scheduler';
import { getClaudeApiKey, isOAuthToken, getEnvVarNames } from '../config/env-config';

// Error types for classification
export type ErrorType = 
  | 'auth_error'
  | 'rate_limit'
  | 'server_error'
  | 'transient'
  | 'config_error'
  | 'unknown';

// Error classifier function
function classifyError(errorMessage: string): ErrorType {
  const lowerError = errorMessage.toLowerCase();
  
  if (
    lowerError.includes('invalid api key') ||
    lowerError.includes('authentication_failed') ||
    lowerError.includes('unauthorized')
  ) {
    return 'auth_error';
  }
  
  if (
    lowerError.includes('rate limit') ||
    lowerError.includes('429') ||
    lowerError.includes('too many requests')
  ) {
    return 'rate_limit';
  }
  
  if (
    lowerError.includes('500') ||
    lowerError.includes('502') ||
    lowerError.includes('503') ||
    lowerError.includes('internal server error')
  ) {
    return 'server_error';
  }
  
  if (
    lowerError.includes('enoent') ||
    lowerError.includes('not found') ||
    lowerError.includes('missing')
  ) {
    return 'config_error';
  }
  
  if (
    lowerError.includes('econnrefused') ||
    lowerError.includes('timeout') ||
    lowerError.includes('network')
  ) {
    return 'transient';
  }
  
  return 'unknown';
}

export interface HarnessConfig {
  projectId: string;
  projectPath: string;
  continuous: boolean;
  maxSessions: number;
  sessionDelayMs: number;
  useScheduler?: boolean;  // Enable scheduler integration
}

export interface HarnessStatus {
  projectId: string;
  status: 'idle' | 'running' | 'stopping' | 'error' | 'paused';
  pid?: number;
  sessionNumber?: number;
  sessionType?: 'initializer' | 'coding';
  featuresTotal?: number;
  featuresPassing?: number;
  startedAt?: Date;
  lastUpdate?: Date;
  error?: string;
  errorType?: ErrorType;
  consecutiveErrors?: number;
  nextRetryAt?: Date;
  schedulerStatus?: {
    paused: boolean;
    queuedJobs: number;
    consecutiveErrors: number;
  };
}

interface RunningHarness {
  process: ChildProcess;
  config: HarnessConfig;
  status: HarnessStatus;
  logBuffer: string[];
}

export class HarnessManager extends EventEmitter {
  private harnesses: Map<string, RunningHarness> = new Map();
  private redis: Redis;
  private scheduler: TaskScheduler;
  private readonly HARNESS_SCRIPT = 'harness/run-harness.js';
  private readonly MAX_LOG_BUFFER = 1000;

  constructor(redisUrl?: string) {
    super();
    
    // Initialize scheduler with rate limiting
    this.scheduler = getScheduler();
    
    // Listen to scheduler events
    this.scheduler.on('circuit:opened', (data: { failures: number }) => {
      console.log(`🔐 Circuit breaker opened after ${data.failures} failures`);
      this.emit('scheduler:paused', { reason: 'Too many failures' });
    });
    
    this.scheduler.on('circuit:closed', () => {
      console.log(`▶️ Circuit breaker closed`);
      this.emit('scheduler:resumed');
    });
    
    try {
      this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
      
      // Handle Redis connection errors gracefully
      this.redis.on('error', (err) => {
        console.warn('Redis connection error (harness will work without Redis):', err.message);
      });
      
      this.redis.on('connect', () => {
        console.log('HarnessManager: Redis connected');
      });
    } catch (error: any) {
      console.warn('Failed to initialize Redis (harness will work without Redis):', error.message);
      // Create a mock Redis that doesn't actually connect
      this.redis = {
        hset: async () => 0,
        hgetall: async () => ({}),
        del: async () => 0,
        on: () => this.redis,
        psubscribe: async () => {},
      } as any;
    }
  }

  /**
   * Start a harness for a project
   */
  async start(config: HarnessConfig): Promise<HarnessStatus> {
    const { projectId, projectPath } = config;

    // Check if already running
    if (this.harnesses.has(projectId)) {
      const existing = this.harnesses.get(projectId)!;
      if (existing.status.status === 'running') {
        throw new Error(`Harness already running for project ${projectId}`);
      }
    }

    // Verify project path exists
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    // Build command arguments
    // The harness script is in the root harness/ directory, not in the project
    // We use the root harness script, not a project-specific one
    // __dirname in compiled code will be backend/dist/services, so we need to go up 3 levels
    // Or use process.cwd() which should be the project root when running from backend/
    let projectRoot: string;
    
    // Try multiple resolution strategies
    const possibleRoots = [
      path.resolve(__dirname, '..', '..', '..'), // From backend/dist/services -> backend/dist -> backend -> root
      path.resolve(__dirname, '..', '..'),       // From backend/dist/services -> backend/dist -> backend (fallback)
      process.cwd(),                              // Current working directory
      path.resolve(process.cwd(), '..'),          // Parent of cwd (if cwd is backend/)
    ];
    
    // Find the root by looking for harness/run-harness.js
    for (const possibleRoot of possibleRoots) {
      const testPath = path.join(possibleRoot, 'harness', 'run-harness.js');
      if (fs.existsSync(testPath)) {
        projectRoot = possibleRoot;
        break;
      }
    }
    
    if (!projectRoot!) {
      // Last resort: assume we're in backend/ and go up one level
      projectRoot = path.resolve(process.cwd(), '..');
    }
    
    const harnessScriptPath = path.join(projectRoot, 'harness', 'run-harness.js');
    
    // Verify harness script exists
    if (!fs.existsSync(harnessScriptPath)) {
      // Provide helpful error message with all attempted paths
      const attemptedPaths = possibleRoots.map(r => path.join(r, 'harness', 'run-harness.js'));
      throw new Error(
        `Harness script not found: ${harnessScriptPath}\n` +
        `Attempted paths:\n${attemptedPaths.map(p => `  - ${p}`).join('\n')}\n` +
        `Current __dirname: ${__dirname}\n` +
        `Current cwd: ${process.cwd()}`
      );
    }
    
    const args = [harnessScriptPath];
    if (config.continuous) {
      args.push('--continuous');
    }
    if (config.maxSessions) {
      args.push(`--max=${config.maxSessions}`);
    }

    // Ensure OAuth token is available in environment
    // Use configurable environment variable names
    const envNames = getEnvVarNames();
    const oauthToken = getClaudeApiKey();
    
    if (!oauthToken) {
      console.error('⚠️  WARNING: No OAuth token or API key found in environment!');
      console.error(`   Make sure ${envNames.claudeOAuthToken} or ${envNames.claudeApiKey} is set in backend/.env`);
    } else {
      const tokenType = isOAuthToken() ? 'OAuth' : 'API Key';
      console.log(`✅ Using ${tokenType} token (${oauthToken.substring(0, 20)}...)`);
    }
    
    const env = {
      ...process.env,
      PROJECT_PATH: projectPath,
      PROJECT_ID: projectId,
      // Explicitly set both environment variables using configured names
      [envNames.claudeOAuthToken]: oauthToken,
      [envNames.claudeApiKey]: oauthToken, // Also set as API key for compatibility
    };
    
    // Spawn the harness process from the project root, not from a harness subdirectory
    const harnessProcess = spawn('node', args, {
      cwd: projectPath, // Run from project root, not from project/harness
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const status: HarnessStatus = {
      projectId,
      status: 'running',
      pid: harnessProcess.pid,
      startedAt: new Date(),
      lastUpdate: new Date(),
    };

    const runningHarness: RunningHarness = {
      process: harnessProcess,
      config,
      status,
      logBuffer: [],
    };

    this.harnesses.set(projectId, runningHarness);

    // Handle stdout
    harnessProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(line => {
        this.processLogLine(projectId, line);
      });
    });

    // Handle stderr
    harnessProcess.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(line => {
        this.processLogLine(projectId, `[ERROR] ${line}`);
      });
    });

    // Handle process exit
    harnessProcess.on('close', (code) => {
      const harness = this.harnesses.get(projectId);
      if (harness) {
        harness.status.status = code === 0 ? 'idle' : 'error';
        harness.status.lastUpdate = new Date();
        if (code !== 0) {
          harness.status.error = `Process exited with code ${code}`;
        }
        this.emit('harness:stopped', { projectId, code });
        this.publishEvent(projectId, 'harness:stopped', { code });
      }
    });

    harnessProcess.on('error', (err) => {
      const harness = this.harnesses.get(projectId);
      if (harness) {
        harness.status.status = 'error';
        harness.status.error = err.message;
        this.emit('harness:error', { projectId, error: err.message });
        this.publishEvent(projectId, 'harness:error', { error: err.message });
      }
    });

    // Store in Redis for persistence (non-blocking)
    try {
      await this.redis.hset(`harness:${projectId}`, {
        pid: harnessProcess.pid?.toString() || '',
        status: 'running',
        startedAt: status.startedAt!.toISOString(),
        config: JSON.stringify(config),
      });
    } catch (redisError: any) {
      console.warn('Redis write failed (non-critical):', redisError.message);
    }

    this.emit('harness:started', { projectId, pid: harnessProcess.pid });
    this.publishEvent(projectId, 'harness:started', { pid: harnessProcess.pid });

    return status;
  }

  /**
   * Stop a running harness
   */
  async stop(projectId: string, force: boolean = false): Promise<HarnessStatus> {
    const harness = this.harnesses.get(projectId);
    
    if (!harness) {
      // Check Redis for orphaned process
      try {
        const stored = await this.redis.hgetall(`harness:${projectId}`);
        if (stored.pid) {
          try {
            process.kill(parseInt(stored.pid), force ? 'SIGKILL' : 'SIGTERM');
          } catch (e) {
            // Process already dead
          }
          try {
            await this.redis.del(`harness:${projectId}`);
          } catch (redisError) {
            // Ignore Redis errors
          }
        }
      } catch (redisError: any) {
        console.warn('Redis read failed (non-critical):', redisError.message);
      }
      return { projectId, status: 'idle' };
    }

    harness.status.status = 'stopping';
    this.emit('harness:stopping', { projectId });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if graceful shutdown takes too long
        harness.process.kill('SIGKILL');
      }, force ? 0 : 10000);

      harness.process.once('close', async () => {
        clearTimeout(timeout);
        harness.status.status = 'idle';
        harness.status.lastUpdate = new Date();
        try {
          await this.redis.del(`harness:${projectId}`);
        } catch (redisError: any) {
          console.warn('Redis delete failed (non-critical):', redisError.message);
        }
        resolve(harness.status);
      });

      harness.process.kill(force ? 'SIGKILL' : 'SIGTERM');
    });
  }

  /**
   * Get status of a harness
   */
  async getStatus(projectId: string): Promise<HarnessStatus> {
    const harness = this.harnesses.get(projectId);
    
    if (harness) {
      return { ...harness.status };
    }

    // Check Redis for stored status
    try {
      const stored = await this.redis.hgetall(`harness:${projectId}`);
      if (stored.status) {
        return {
          projectId,
          status: stored.status as HarnessStatus['status'],
          pid: stored.pid ? parseInt(stored.pid) : undefined,
          startedAt: stored.startedAt ? new Date(stored.startedAt) : undefined,
        };
      }
    } catch (redisError: any) {
      console.warn('Redis read failed (non-critical):', redisError.message);
    }

    return { projectId, status: 'idle' };
  }

  /**
   * Get recent logs for a project
   */
  getLogs(projectId: string, limit: number = 100): string[] {
    const harness = this.harnesses.get(projectId);
    if (!harness) return [];
    
    return harness.logBuffer.slice(-limit);
  }

  /**
   * Stream logs as an async generator
   */
  async *streamLogs(projectId: string): AsyncGenerator<string> {
    const harness = this.harnesses.get(projectId);
    if (!harness) return;

    // Emit buffered logs first
    for (const line of harness.logBuffer) {
      yield line;
    }

    // Then stream new logs
    const logHandler = (data: { projectId: string; line: string }) => {
      if (data.projectId === projectId) {
        return data.line;
      }
    };

    // This is a simplified version - in production use a proper async queue
    while (harness.status.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 100));
      // In real implementation, yield from an async queue
    }
  }

  /**
   * Process a log line from the harness
   */
  private processLogLine(projectId: string, line: string): void {
    const harness = this.harnesses.get(projectId);
    if (!harness) return;

    // Add to buffer
    harness.logBuffer.push(line);
    if (harness.logBuffer.length > this.MAX_LOG_BUFFER) {
      harness.logBuffer.shift();
    }

    // Parse for status updates
    this.parseLogForStatus(projectId, line);

    // Emit event
    this.emit('harness:log', { projectId, line });
    this.publishEvent(projectId, 'harness:log', { line });
  }

  /**
   * Parse log lines to extract status information
   */
  private parseLogForStatus(projectId: string, line: string): void {
    const harness = this.harnesses.get(projectId);
    if (!harness) return;

    // Parse session info: "Starting session #12 (CODING)"
    const sessionMatch = line.match(/session #?(\d+)\s*\((\w+)\)/i);
    if (sessionMatch) {
      harness.status.sessionNumber = parseInt(sessionMatch[1]);
      harness.status.sessionType = sessionMatch[2].toLowerCase() as 'initializer' | 'coding';
      harness.status.lastUpdate = new Date();
    }

    // Parse progress: "Progress: 45/100 features (45%)"
    const progressMatch = line.match(/(\d+)\/(\d+)\s*features/i);
    if (progressMatch) {
      harness.status.featuresPassing = parseInt(progressMatch[1]);
      harness.status.featuresTotal = parseInt(progressMatch[2]);
      harness.status.lastUpdate = new Date();
      
      this.emit('harness:progress', {
        projectId,
        passing: harness.status.featuresPassing,
        total: harness.status.featuresTotal,
      });
    }

    // Parse completion
    if (line.includes('Project complete') || line.includes('All features implemented')) {
      harness.status.status = 'idle';
      harness.status.lastUpdate = new Date();
    }
    
    // Detect and classify errors
    if (line.includes('authentication_failed') || line.includes('Invalid API key')) {
      const errorType = classifyError(line);
      harness.status.errorType = errorType;
      harness.status.error = 'Authentication failed - check API key';
      
      this.emit('harness:auth_error', { projectId, errorType });
      
      // Stop harness on auth errors - don't keep retrying
      if (errorType === 'auth_error') {
        console.log('🔐 Auth error detected - stopping harness to prevent repeated failures');
        this.stop(projectId, false).catch(err => {
          console.error('Failed to stop harness on auth error:', err);
        });
      }
    }
    
    // Detect rate limiting
    if (line.includes('rate limit') || line.includes('429') || line.includes('too many requests')) {
      const errorType = classifyError(line);
      harness.status.errorType = errorType;
      
      this.emit('harness:rate_limit', { projectId });
    }
  }

  /**
   * Publish event to Redis for Socket.IO distribution
   */
  private async publishEvent(projectId: string, event: string, data: any): Promise<void> {
    try {
      await this.redis.publish(`agent:events:${projectId}`, JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString(),
      }));
    } catch (error: any) {
      // Non-critical - events can be lost if Redis is unavailable
      console.warn('Failed to publish event (non-critical):', error.message);
    }
  }

  /**
   * Get all running harnesses
   */
  getAllRunning(): HarnessStatus[] {
    return Array.from(this.harnesses.values())
      .filter(h => h.status.status === 'running')
      .map(h => ({ ...h.status }));
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    const promises = Array.from(this.harnesses.keys()).map(id => this.stop(id, true));
    await Promise.all(promises);
    try {
      await this.redis.quit();
    } catch (error: any) {
      console.warn('Redis quit failed (non-critical):', error.message);
    }
  }
}

// Singleton instance
let instance: HarnessManager | null = null;

export function getHarnessManager(): HarnessManager {
  if (!instance) {
    instance = new HarnessManager();
  }
  return instance;
}

export default HarnessManager;
