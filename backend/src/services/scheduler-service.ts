/**
 * Scheduler Service
 * =================
 * 
 * Robust scheduling service for autonomous coding sessions with:
 * - Rate limiting (token bucket algorithm matching Claude API)
 * - Exponential backoff with jitter for failures
 * - Error classification (auth, rate limit, transient)
 * - Multi-project scheduling with priority queues
 * - Usage tracking and metrics
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

// ============================================
// Types and Interfaces
// ============================================

export interface RateLimitConfig {
  requestsPerMinute: number;      // RPM limit
  inputTokensPerMinute: number;   // ITPM limit
  outputTokensPerMinute: number;  // OTPM limit
  burstMultiplier: number;        // Allow short bursts up to this multiplier
}

export interface SchedulerConfig {
  // Rate limiting
  rateLimits: RateLimitConfig;
  
  // Backoff settings
  initialBackoffMs: number;       // Starting backoff (default: 1000ms)
  maxBackoffMs: number;           // Max backoff (default: 5 minutes)
  backoffMultiplier: number;      // Multiplier per failure (default: 2)
  jitterFactor: number;           // Random jitter 0-1 (default: 0.1)
  
  // Session settings
  minSessionGapMs: number;        // Minimum gap between sessions (default: 5s)
  maxConcurrentSessions: number;  // Max concurrent sessions across all projects
  
  // Error handling
  maxConsecutiveErrors: number;   // Stop after N consecutive errors
  authErrorPauseMs: number;       // Pause duration for auth errors (default: 1 hour)
  
  // Storage
  stateFile?: string;             // Persist state to file
}

export interface ScheduledJob {
  id: string;
  projectId: string;
  projectPath: string;
  priority: number;               // 1-10, higher = more urgent
  scheduledFor: Date;
  createdAt: Date;
  attempts: number;
  lastError?: string;
  lastErrorType?: ErrorType;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'paused';
}

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;  // tokens per second
}

export type ErrorType = 
  | 'auth_error'           // Invalid API key - stop retrying
  | 'rate_limit'           // 429 - back off and retry
  | 'server_error'         // 5xx - retry with backoff
  | 'transient'            // Network issues - retry quickly
  | 'config_error'         // Missing files, bad config - stop
  | 'unknown';

export interface UsageMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  rateLimitHits: number;
  authErrors: number;
  lastRequestTime?: Date;
  windowStart: Date;
}

export interface SchedulerState {
  jobs: ScheduledJob[];
  metrics: UsageMetrics;
  rateLimitBuckets: {
    requests: TokenBucket;
    inputTokens: TokenBucket;
    outputTokens: TokenBucket;
  };
  paused: boolean;
  pausedUntil?: Date;
  pauseReason?: string;
  consecutiveErrors: number;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: SchedulerConfig = {
  rateLimits: {
    // Conservative defaults for Tier 1
    requestsPerMinute: 50,         // 50 RPM
    inputTokensPerMinute: 40000,   // 40K ITPM
    outputTokensPerMinute: 8000,   // 8K OTPM
    burstMultiplier: 1.2,
  },
  initialBackoffMs: 1000,
  maxBackoffMs: 300000,            // 5 minutes
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  minSessionGapMs: 5000,
  maxConcurrentSessions: 1,
  maxConsecutiveErrors: 10,
  authErrorPauseMs: 3600000,       // 1 hour
};

// ============================================
// Scheduler Service
// ============================================

export class SchedulerService extends EventEmitter {
  private config: SchedulerConfig;
  private state: SchedulerState;
  private processingTimer?: NodeJS.Timeout;
  private stateFile?: string;

  constructor(config: Partial<SchedulerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stateFile = config.stateFile;
    this.state = this.initializeState();
    
    if (this.stateFile) {
      this.loadState();
    }
  }

  // ============================================
  // State Management
  // ============================================

  private initializeState(): SchedulerState {
    const now = Date.now();
    return {
      jobs: [],
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        rateLimitHits: 0,
        authErrors: 0,
        windowStart: new Date(),
      },
      rateLimitBuckets: {
        requests: this.createBucket(
          this.config.rateLimits.requestsPerMinute,
          this.config.rateLimits.requestsPerMinute / 60
        ),
        inputTokens: this.createBucket(
          this.config.rateLimits.inputTokensPerMinute,
          this.config.rateLimits.inputTokensPerMinute / 60
        ),
        outputTokens: this.createBucket(
          this.config.rateLimits.outputTokensPerMinute,
          this.config.rateLimits.outputTokensPerMinute / 60
        ),
      },
      paused: false,
      consecutiveErrors: 0,
    };
  }

  private createBucket(capacity: number, refillRate: number): TokenBucket {
    return {
      tokens: capacity,
      lastRefill: Date.now(),
      capacity,
      refillRate,
    };
  }

  private loadState(): void {
    if (!this.stateFile || !fs.existsSync(this.stateFile)) return;
    
    try {
      const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
      
      // Restore jobs
      this.state.jobs = (data.jobs || []).map((job: any) => ({
        ...job,
        scheduledFor: new Date(job.scheduledFor),
        createdAt: new Date(job.createdAt),
      }));
      
      // Restore metrics
      if (data.metrics) {
        this.state.metrics = {
          ...data.metrics,
          windowStart: new Date(data.metrics.windowStart),
          lastRequestTime: data.metrics.lastRequestTime 
            ? new Date(data.metrics.lastRequestTime) 
            : undefined,
        };
      }
      
      // Restore pause state
      if (data.pausedUntil) {
        const pausedUntil = new Date(data.pausedUntil);
        if (pausedUntil > new Date()) {
          this.state.paused = true;
          this.state.pausedUntil = pausedUntil;
          this.state.pauseReason = data.pauseReason;
        }
      }
      
      console.log(`Scheduler: Loaded ${this.state.jobs.length} jobs from state`);
    } catch (error: any) {
      console.warn('Scheduler: Failed to load state:', error.message);
    }
  }

  private saveState(): void {
    if (!this.stateFile) return;
    
    try {
      const dir = path.dirname(this.stateFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.stateFile, JSON.stringify({
        jobs: this.state.jobs,
        metrics: this.state.metrics,
        paused: this.state.paused,
        pausedUntil: this.state.pausedUntil,
        pauseReason: this.state.pauseReason,
        consecutiveErrors: this.state.consecutiveErrors,
        savedAt: new Date().toISOString(),
      }, null, 2));
    } catch (error: any) {
      console.warn('Scheduler: Failed to save state:', error.message);
    }
  }

  // ============================================
  // Token Bucket Rate Limiting
  // ============================================

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * bucket.refillRate;
    
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  private tryConsumeBucket(bucket: TokenBucket, amount: number): boolean {
    this.refillBucket(bucket);
    
    if (bucket.tokens >= amount) {
      bucket.tokens -= amount;
      return true;
    }
    return false;
  }

  private getWaitTimeForBucket(bucket: TokenBucket, amount: number): number {
    this.refillBucket(bucket);
    
    if (bucket.tokens >= amount) return 0;
    
    const deficit = amount - bucket.tokens;
    const waitSeconds = deficit / bucket.refillRate;
    return Math.ceil(waitSeconds * 1000); // ms
  }

  /**
   * Check if we can make a request now
   */
  canMakeRequest(estimatedInputTokens = 1000, estimatedOutputTokens = 500): boolean {
    if (this.state.paused) {
      if (this.state.pausedUntil && new Date() >= this.state.pausedUntil) {
        this.resume();
      } else {
        return false;
      }
    }
    
    // Check all buckets
    const requestBucket = { ...this.state.rateLimitBuckets.requests };
    const inputBucket = { ...this.state.rateLimitBuckets.inputTokens };
    const outputBucket = { ...this.state.rateLimitBuckets.outputTokens };
    
    this.refillBucket(requestBucket);
    this.refillBucket(inputBucket);
    this.refillBucket(outputBucket);
    
    return (
      requestBucket.tokens >= 1 &&
      inputBucket.tokens >= estimatedInputTokens &&
      outputBucket.tokens >= estimatedOutputTokens
    );
  }

  /**
   * Get time to wait before next request is allowed
   */
  getWaitTime(estimatedInputTokens = 1000, estimatedOutputTokens = 500): number {
    if (this.state.paused && this.state.pausedUntil) {
      return Math.max(0, this.state.pausedUntil.getTime() - Date.now());
    }
    
    const requestWait = this.getWaitTimeForBucket(
      this.state.rateLimitBuckets.requests, 1
    );
    const inputWait = this.getWaitTimeForBucket(
      this.state.rateLimitBuckets.inputTokens, estimatedInputTokens
    );
    const outputWait = this.getWaitTimeForBucket(
      this.state.rateLimitBuckets.outputTokens, estimatedOutputTokens
    );
    
    return Math.max(requestWait, inputWait, outputWait);
  }

  /**
   * Consume tokens for a request
   */
  consumeTokens(inputTokens: number, outputTokens: number): void {
    this.tryConsumeBucket(this.state.rateLimitBuckets.requests, 1);
    this.tryConsumeBucket(this.state.rateLimitBuckets.inputTokens, inputTokens);
    this.tryConsumeBucket(this.state.rateLimitBuckets.outputTokens, outputTokens);
    
    this.state.metrics.totalRequests++;
    this.state.metrics.totalInputTokens += inputTokens;
    this.state.metrics.totalOutputTokens += outputTokens;
    this.state.metrics.lastRequestTime = new Date();
    
    this.saveState();
  }

  // ============================================
  // Backoff Calculation
  // ============================================

  /**
   * Calculate exponential backoff with jitter
   */
  calculateBackoff(attempts: number, errorType: ErrorType): number {
    // Auth errors get long pause
    if (errorType === 'auth_error') {
      return this.config.authErrorPauseMs;
    }
    
    // Config errors shouldn't retry
    if (errorType === 'config_error') {
      return Infinity;
    }
    
    // Rate limits use retry-after if available, otherwise exponential
    const baseBackoff = this.config.initialBackoffMs * 
      Math.pow(this.config.backoffMultiplier, attempts - 1);
    
    const backoff = Math.min(baseBackoff, this.config.maxBackoffMs);
    
    // Add jitter
    const jitter = backoff * this.config.jitterFactor * Math.random();
    
    return Math.floor(backoff + jitter);
  }

  /**
   * Classify an error from Claude API/CLI output
   */
  classifyError(errorMessage: string, exitCode?: number): ErrorType {
    const lowerError = errorMessage.toLowerCase();
    
    // Authentication errors
    if (
      lowerError.includes('invalid api key') ||
      lowerError.includes('authentication_failed') ||
      lowerError.includes('unauthorized') ||
      lowerError.includes('api key') ||
      lowerError.includes('invalid_api_key')
    ) {
      return 'auth_error';
    }
    
    // Rate limiting
    if (
      lowerError.includes('rate limit') ||
      lowerError.includes('429') ||
      lowerError.includes('too many requests') ||
      lowerError.includes('overloaded')
    ) {
      return 'rate_limit';
    }
    
    // Server errors
    if (
      lowerError.includes('500') ||
      lowerError.includes('502') ||
      lowerError.includes('503') ||
      lowerError.includes('504') ||
      lowerError.includes('internal server error') ||
      lowerError.includes('service unavailable')
    ) {
      return 'server_error';
    }
    
    // Configuration errors
    if (
      lowerError.includes('not found') ||
      lowerError.includes('missing') ||
      lowerError.includes('file not found') ||
      lowerError.includes('enoent')
    ) {
      return 'config_error';
    }
    
    // Network/transient errors
    if (
      lowerError.includes('econnrefused') ||
      lowerError.includes('econnreset') ||
      lowerError.includes('etimedout') ||
      lowerError.includes('network') ||
      lowerError.includes('timeout')
    ) {
      return 'transient';
    }
    
    return 'unknown';
  }

  // ============================================
  // Job Management
  // ============================================

  /**
   * Schedule a new job
   */
  scheduleJob(
    projectId: string, 
    projectPath: string, 
    options: { priority?: number; delayMs?: number } = {}
  ): ScheduledJob {
    const { priority = 5, delayMs = 0 } = options;
    
    const job: ScheduledJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      projectPath,
      priority,
      scheduledFor: new Date(Date.now() + delayMs),
      createdAt: new Date(),
      attempts: 0,
      status: 'queued',
    };
    
    this.state.jobs.push(job);
    this.sortJobs();
    this.saveState();
    
    this.emit('job:scheduled', job);
    
    return job;
  }

  /**
   * Get next job to execute
   */
  getNextJob(): ScheduledJob | null {
    const now = new Date();
    
    // Find first queued job that's ready
    const job = this.state.jobs.find(j => 
      j.status === 'queued' && j.scheduledFor <= now
    );
    
    return job || null;
  }

  /**
   * Sort jobs by priority and scheduled time
   */
  private sortJobs(): void {
    this.state.jobs.sort((a, b) => {
      // Higher priority first
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Earlier scheduled time first
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });
  }

  /**
   * Update job status
   */
  updateJob(jobId: string, updates: Partial<ScheduledJob>): ScheduledJob | null {
    const job = this.state.jobs.find(j => j.id === jobId);
    if (!job) return null;
    
    Object.assign(job, updates);
    this.saveState();
    
    return job;
  }

  /**
   * Handle job failure with backoff
   */
  handleJobFailure(
    jobId: string, 
    errorMessage: string, 
    retryAfterMs?: number
  ): ScheduledJob | null {
    const job = this.state.jobs.find(j => j.id === jobId);
    if (!job) return null;
    
    const errorType = this.classifyError(errorMessage);
    job.attempts++;
    job.lastError = errorMessage;
    job.lastErrorType = errorType;
    
    this.state.consecutiveErrors++;
    this.state.metrics.failedRequests++;
    
    // Update metrics
    if (errorType === 'rate_limit') {
      this.state.metrics.rateLimitHits++;
    } else if (errorType === 'auth_error') {
      this.state.metrics.authErrors++;
    }
    
    // Determine if we should continue
    if (errorType === 'auth_error') {
      console.log(`🔐 Auth error detected - pausing scheduler for ${this.config.authErrorPauseMs / 1000}s`);
      this.pause(this.config.authErrorPauseMs, 'Authentication failed - check API key');
      job.status = 'paused';
    } else if (errorType === 'config_error') {
      console.log(`⚠️ Config error - not retrying: ${errorMessage}`);
      job.status = 'failed';
    } else if (this.state.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      console.log(`❌ Max consecutive errors (${this.config.maxConsecutiveErrors}) reached`);
      this.pause(this.config.maxBackoffMs, `Too many errors: ${errorMessage}`);
      job.status = 'paused';
    } else {
      // Calculate backoff
      const backoff = retryAfterMs || this.calculateBackoff(job.attempts, errorType);
      job.scheduledFor = new Date(Date.now() + backoff);
      job.status = 'queued';
      
      console.log(`⏳ Rescheduling job in ${backoff / 1000}s (attempt ${job.attempts})`);
    }
    
    this.saveState();
    this.emit('job:failed', { job, errorType, errorMessage });
    
    return job;
  }

  /**
   * Handle job success
   */
  handleJobSuccess(jobId: string, metrics?: { inputTokens: number; outputTokens: number }): ScheduledJob | null {
    const job = this.state.jobs.find(j => j.id === jobId);
    if (!job) return null;
    
    job.status = 'completed';
    this.state.consecutiveErrors = 0;
    this.state.metrics.successfulRequests++;
    
    if (metrics) {
      this.consumeTokens(metrics.inputTokens, metrics.outputTokens);
    }
    
    this.saveState();
    this.emit('job:completed', job);
    
    return job;
  }

  /**
   * Remove a job
   */
  removeJob(jobId: string): boolean {
    const index = this.state.jobs.findIndex(j => j.id === jobId);
    if (index === -1) return false;
    
    this.state.jobs.splice(index, 1);
    this.saveState();
    
    return true;
  }

  /**
   * Get all jobs for a project
   */
  getJobsForProject(projectId: string): ScheduledJob[] {
    return this.state.jobs.filter(j => j.projectId === projectId);
  }

  /**
   * Clear completed/failed jobs older than specified age
   */
  cleanupJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.state.jobs.length;
    
    this.state.jobs = this.state.jobs.filter(j => 
      j.status === 'queued' || 
      j.status === 'running' ||
      j.createdAt.getTime() > cutoff
    );
    
    const removed = before - this.state.jobs.length;
    if (removed > 0) {
      this.saveState();
    }
    
    return removed;
  }

  // ============================================
  // Scheduler Control
  // ============================================

  /**
   * Pause the scheduler
   */
  pause(durationMs?: number, reason?: string): void {
    this.state.paused = true;
    this.state.pauseReason = reason;
    
    if (durationMs) {
      this.state.pausedUntil = new Date(Date.now() + durationMs);
    }
    
    this.saveState();
    this.emit('scheduler:paused', { reason, until: this.state.pausedUntil });
    
    console.log(`⏸️ Scheduler paused${reason ? `: ${reason}` : ''}`);
  }

  /**
   * Resume the scheduler
   */
  resume(): void {
    this.state.paused = false;
    this.state.pausedUntil = undefined;
    this.state.pauseReason = undefined;
    this.state.consecutiveErrors = 0;
    
    // Resume paused jobs
    this.state.jobs
      .filter(j => j.status === 'paused')
      .forEach(j => {
        j.status = 'queued';
        j.scheduledFor = new Date();
      });
    
    this.saveState();
    this.emit('scheduler:resumed');
    
    console.log(`▶️ Scheduler resumed`);
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    paused: boolean;
    pausedUntil?: Date;
    pauseReason?: string;
    queuedJobs: number;
    runningJobs: number;
    consecutiveErrors: number;
    metrics: UsageMetrics;
    canMakeRequest: boolean;
    waitTime: number;
  } {
    return {
      paused: this.state.paused,
      pausedUntil: this.state.pausedUntil,
      pauseReason: this.state.pauseReason,
      queuedJobs: this.state.jobs.filter(j => j.status === 'queued').length,
      runningJobs: this.state.jobs.filter(j => j.status === 'running').length,
      consecutiveErrors: this.state.consecutiveErrors,
      metrics: this.state.metrics,
      canMakeRequest: this.canMakeRequest(),
      waitTime: this.getWaitTime(),
    };
  }

  /**
   * Update rate limits (e.g., from API response headers)
   */
  updateRateLimits(limits: Partial<RateLimitConfig>): void {
    Object.assign(this.config.rateLimits, limits);
    
    // Update bucket capacities
    if (limits.requestsPerMinute) {
      this.state.rateLimitBuckets.requests.capacity = limits.requestsPerMinute;
      this.state.rateLimitBuckets.requests.refillRate = limits.requestsPerMinute / 60;
    }
    if (limits.inputTokensPerMinute) {
      this.state.rateLimitBuckets.inputTokens.capacity = limits.inputTokensPerMinute;
      this.state.rateLimitBuckets.inputTokens.refillRate = limits.inputTokensPerMinute / 60;
    }
    if (limits.outputTokensPerMinute) {
      this.state.rateLimitBuckets.outputTokens.capacity = limits.outputTokensPerMinute;
      this.state.rateLimitBuckets.outputTokens.refillRate = limits.outputTokensPerMinute / 60;
    }
    
    this.emit('rateLimits:updated', limits);
  }

  /**
   * Parse rate limit headers from API response
   */
  parseRateLimitHeaders(headers: Record<string, string>): Partial<RateLimitConfig> {
    const limits: Partial<RateLimitConfig> = {};
    
    if (headers['anthropic-ratelimit-requests-limit']) {
      limits.requestsPerMinute = parseInt(headers['anthropic-ratelimit-requests-limit']);
    }
    if (headers['anthropic-ratelimit-input-tokens-limit']) {
      limits.inputTokensPerMinute = parseInt(headers['anthropic-ratelimit-input-tokens-limit']);
    }
    if (headers['anthropic-ratelimit-output-tokens-limit']) {
      limits.outputTokensPerMinute = parseInt(headers['anthropic-ratelimit-output-tokens-limit']);
    }
    
    return limits;
  }

  /**
   * Get retry-after from headers
   */
  parseRetryAfter(headers: Record<string, string>): number | null {
    const retryAfter = headers['retry-after'];
    if (!retryAfter) return null;
    
    // Could be seconds or a date
    const seconds = parseInt(retryAfter);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
    
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }
    
    return null;
  }

  /**
   * Reset metrics (e.g., at start of new day/month)
   */
  resetMetrics(): void {
    this.state.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      rateLimitHits: 0,
      authErrors: 0,
      windowStart: new Date(),
    };
    this.saveState();
  }
}

// ============================================
// Singleton Instance
// ============================================

let schedulerInstance: SchedulerService | null = null;

export function getScheduler(config?: Partial<SchedulerConfig>): SchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService({
      stateFile: path.join(process.cwd(), 'data', 'scheduler-state.json'),
      ...config,
    });
  }
  return schedulerInstance;
}

export default SchedulerService;
