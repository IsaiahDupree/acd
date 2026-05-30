/**
 * Task Scheduler Service
 * 
 * Manages task scheduling with rate limiting, retry logic, and robust error handling.
 * Designed to work with Claude API and other external services.
 * 
 * Rate Limits (Claude API):
 * - Free tier: ~50 requests/minute
 * - Paid tier: Higher limits (varies by plan)
 * - OAuth tokens (Claude Code): Typically higher limits, but respect headers
 * 
 * Features:
 * - Rate limiting with configurable windows
 * - Exponential backoff retry logic
 * - Circuit breaker pattern
 * - Priority-based task queue
 * - Rate limit header parsing
 */

import { EventEmitter } from 'events';

export interface RateLimitConfig {
  // Requests per time window
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  
  // Concurrent requests
  maxConcurrent?: number;
  
  // Retry configuration
  maxRetries?: number;
  retryDelayMs?: number;
  exponentialBackoff?: boolean;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
  
  // Circuit breaker
  circuitBreakerThreshold?: number; // Failures before opening circuit
  circuitBreakerTimeout?: number; // Time before attempting to close circuit (ms)
  
  // Rate limit headers (from API responses)
  respectRateLimitHeaders?: boolean;
  
  // Minimum time between requests (ms)
  minTimeBetweenRequests?: number;
}

export interface ScheduledTask {
  id: string;
  projectId: string;
  type: 'harness_session' | 'api_call' | 'feature_implementation' | 'test_run' | 'other';
  priority: number; // Higher = more priority (1-100)
  execute: () => Promise<any>;
  retries: number;
  createdAt: Date;
  scheduledFor: Date;
  metadata?: Record<string, any>;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: Error;
  duration: number;
  retries: number;
}

export interface RateLimitState {
  requestsInWindow: number;
  windowStart: Date;
  remainingRequests?: number;
  resetAt?: Date;
  limit?: number;
  lastRequestTime?: Date;
}

class TaskScheduler extends EventEmitter {
  private taskQueue: ScheduledTask[] = [];
  private runningTasks: Map<string, Promise<any>> = new Map();
  private rateLimitState: RateLimitState;
  private config: Required<RateLimitConfig>;
  private circuitBreakerOpen: boolean = false;
  private circuitBreakerFailures: number = 0;
  private circuitBreakerOpenedAt: Date | null = null;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig = {}) {
    super();
    
    // Default configuration - conservative for Claude API
    // Claude Code OAuth tokens typically have higher limits, but we start conservative
    this.config = {
      requestsPerMinute: config.requestsPerMinute || 30, // Conservative: 30 req/min = 1 every 2 seconds
      requestsPerHour: config.requestsPerHour || 1000,
      requestsPerDay: config.requestsPerDay || 10000,
      maxConcurrent: config.maxConcurrent || 1, // Sequential execution for safety
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 2000,
      exponentialBackoff: config.exponentialBackoff !== false,
      backoffMultiplier: config.backoffMultiplier || 2,
      maxBackoffMs: config.maxBackoffMs || 60000, // Max 1 minute backoff
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000, // 1 minute
      respectRateLimitHeaders: config.respectRateLimitHeaders !== false,
      minTimeBetweenRequests: config.minTimeBetweenRequests || 2000, // 2 seconds minimum
    };

    this.rateLimitState = {
      requestsInWindow: 0,
      windowStart: new Date(),
    };

    // Start processing queue
    this.startProcessing();
  }

  /**
   * Schedule a task for execution
   */
  schedule(task: Omit<ScheduledTask, 'id' | 'retries' | 'createdAt' | 'scheduledFor'>): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const scheduledTask: ScheduledTask = {
      ...task,
      id: taskId,
      retries: 0,
      createdAt: new Date(),
      scheduledFor: new Date(), // Execute immediately if queue is empty
    };

    // Insert into queue based on priority
    this.insertTaskByPriority(scheduledTask);
    
    this.emit('task:scheduled', { taskId, task: scheduledTask });
    
    return taskId;
  }

  /**
   * Schedule a task for future execution
   */
  scheduleFor(
    task: Omit<ScheduledTask, 'id' | 'retries' | 'createdAt' | 'scheduledFor'>,
    delayMs: number
  ): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const scheduledTask: ScheduledTask = {
      ...task,
      id: taskId,
      retries: 0,
      createdAt: new Date(),
      scheduledFor: new Date(Date.now() + delayMs),
    };

    this.insertTaskByPriority(scheduledTask);
    
    this.emit('task:scheduled', { taskId, task: scheduledTask, delayMs });
    
    return taskId;
  }

  /**
   * Insert task into queue maintaining priority order
   */
  private insertTaskByPriority(task: ScheduledTask): void {
    let insertIndex = this.taskQueue.length;
    
    for (let i = 0; i < this.taskQueue.length; i++) {
      if (this.taskQueue[i].priority < task.priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.taskQueue.splice(insertIndex, 0, task);
  }

  /**
   * Start processing the task queue
   */
  private startProcessing(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    // Process queue every second
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000);
  }

  /**
   * Stop processing the task queue
   */
  stopProcessing(): void {
    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Process the task queue
   */
  private async processQueue(): Promise<void> {
    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      const timeSinceOpen = Date.now() - (this.circuitBreakerOpenedAt?.getTime() || 0);
      if (timeSinceOpen >= this.config.circuitBreakerTimeout) {
        // Try to close circuit breaker
        this.circuitBreakerOpen = false;
        this.circuitBreakerFailures = 0;
        this.emit('circuit:closed');
      } else {
        // Circuit breaker is open, skip processing
        return;
      }
    }

    // Check if we can run more tasks
    if (this.runningTasks.size >= this.config.maxConcurrent) {
      return;
    }

    // Check rate limits
    if (!this.canMakeRequest()) {
      return;
    }

    // Get next task
    const now = new Date();
    const nextTask = this.taskQueue.find(task => task.scheduledFor <= now);
    
    if (!nextTask) {
      return;
    }

    // Remove from queue
    const taskIndex = this.taskQueue.indexOf(nextTask);
    if (taskIndex > -1) {
      this.taskQueue.splice(taskIndex, 1);
    }

    // Execute task
    this.executeTask(nextTask);
  }

  /**
   * Check if we can make a request based on rate limits
   */
  private canMakeRequest(): boolean {
    const now = new Date();
    const windowMs = 60 * 1000; // 1 minute window
    
    // Reset window if needed
    if (now.getTime() - this.rateLimitState.windowStart.getTime() >= windowMs) {
      this.rateLimitState.requestsInWindow = 0;
      this.rateLimitState.windowStart = now;
    }

    // Check minimum time between requests
    if (this.rateLimitState.lastRequestTime) {
      const timeSinceLastRequest = now.getTime() - this.rateLimitState.lastRequestTime.getTime();
      if (timeSinceLastRequest < this.config.minTimeBetweenRequests) {
        return false;
      }
    }

    // Check if we've exceeded the limit from headers
    if (this.rateLimitState.remainingRequests !== undefined) {
      if (this.rateLimitState.remainingRequests <= 0) {
        // Check if we need to wait for reset
        if (this.rateLimitState.resetAt && now < this.rateLimitState.resetAt) {
          return false;
        }
      }
    }

    // Check requests per minute
    if (this.rateLimitState.requestsInWindow >= this.config.requestsPerMinute) {
      return false;
    }

    return true;
  }

  /**
   * Update rate limit state from API response headers
   */
  updateRateLimitState(headers: Record<string, string>): void {
    if (!this.config.respectRateLimitHeaders) return;

    // Common rate limit header formats
    const remaining = 
      headers['x-ratelimit-remaining'] ||
      headers['ratelimit-remaining'] ||
      headers['x-ratelimit-remaining-requests'] ||
      headers['anthropic-ratelimit-remaining-requests'];
    
    const limit = 
      headers['x-ratelimit-limit'] ||
      headers['ratelimit-limit'] ||
      headers['x-ratelimit-limit-requests'] ||
      headers['anthropic-ratelimit-limit-requests'];
    
    const reset = 
      headers['x-ratelimit-reset'] ||
      headers['ratelimit-reset'] ||
      headers['x-ratelimit-reset-after'] ||
      headers['anthropic-ratelimit-reset-after'];

    if (remaining !== undefined) {
      this.rateLimitState.remainingRequests = parseInt(remaining, 10);
    }

    if (limit !== undefined) {
      this.rateLimitState.limit = parseInt(limit, 10);
      // Update our config if we get a lower limit from API
      if (this.rateLimitState.limit < this.config.requestsPerMinute) {
        this.config.requestsPerMinute = this.rateLimitState.limit;
      }
    }

    if (reset !== undefined) {
      const resetSeconds = parseFloat(reset);
      this.rateLimitState.resetAt = new Date(Date.now() + resetSeconds * 1000);
    }
  }

  /**
   * Execute a task
   */
  private async executeTask(task: ScheduledTask): Promise<void> {
    const startTime = Date.now();
    
    // Update rate limit state
    this.rateLimitState.requestsInWindow++;
    this.rateLimitState.lastRequestTime = new Date();
    
    this.emit('task:started', { taskId: task.id, task });

    const taskPromise = (async () => {
      try {
        const result = await task.execute();
        const duration = Date.now() - startTime;

        // Reset circuit breaker on success
        if (this.circuitBreakerFailures > 0) {
          this.circuitBreakerFailures = 0;
        }

        this.emit('task:completed', {
          taskId: task.id,
          success: true,
          result,
          duration,
          retries: task.retries,
        } as TaskResult);

        return { success: true, result, duration, retries: task.retries };
      } catch (error: any) {
        const duration = Date.now() - startTime;

        // Check if it's a rate limit error
        const isRateLimitError = 
          error.message?.includes('rate limit') ||
          error.message?.includes('429') ||
          error.status === 429 ||
          error.code === 'RATE_LIMIT_EXCEEDED';

        // Check if we should retry
        if (task.retries < this.config.maxRetries) {
          // Calculate retry delay
          let delay = this.config.retryDelayMs;
          if (this.config.exponentialBackoff) {
            delay = Math.min(
              this.config.retryDelayMs * Math.pow(this.config.backoffMultiplier, task.retries),
              this.config.maxBackoffMs
            );
          }

          // Longer delay for rate limit errors
          if (isRateLimitError) {
            delay = Math.max(delay, 60000); // At least 1 minute for rate limits
          }

          task.retries++;
          task.scheduledFor = new Date(Date.now() + delay);

          // Re-insert into queue
          this.insertTaskByPriority(task);

          this.emit('task:retry', {
            taskId: task.id,
            error: error.message,
            retry: task.retries,
            delay,
            isRateLimitError,
          });

          return { success: false, error, duration, retries: task.retries, willRetry: true };
        } else {
          // Max retries exceeded
          this.circuitBreakerFailures++;
          
          if (this.circuitBreakerFailures >= this.config.circuitBreakerThreshold) {
            this.circuitBreakerOpen = true;
            this.circuitBreakerOpenedAt = new Date();
            this.emit('circuit:opened', { failures: this.circuitBreakerFailures });
          }

          this.emit('task:failed', {
            taskId: task.id,
            success: false,
            error: error.message ? new Error(error.message) : error,
            duration,
            retries: task.retries,
          } as TaskResult);

          return { success: false, error, duration, retries: task.retries, willRetry: false };
        }
      } finally {
        this.runningTasks.delete(task.id);
      }
    })();

    this.runningTasks.set(task.id, taskPromise);
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueLength: number;
    runningTasks: number;
    rateLimitState: RateLimitState;
    circuitBreakerOpen: boolean;
    circuitBreakerFailures: number;
    config: RateLimitConfig;
  } {
    return {
      queueLength: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      rateLimitState: { ...this.rateLimitState },
      circuitBreakerOpen: this.circuitBreakerOpen,
      circuitBreakerFailures: this.circuitBreakerFailures,
      config: { ...this.config },
    };
  }

  /**
   * Clear the task queue
   */
  clearQueue(): void {
    this.taskQueue = [];
    this.emit('queue:cleared');
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    const taskIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (taskIndex > -1) {
      this.taskQueue.splice(taskIndex, 1);
      this.emit('task:cancelled', { taskId });
      return true;
    }
    return false;
  }

  /**
   * Update configuration (useful for dynamic rate limit adjustments)
   */
  updateConfig(updates: Partial<RateLimitConfig>): void {
    Object.assign(this.config, updates);
    this.emit('config:updated', { config: this.config });
  }
}

// Singleton instance
let schedulerInstance: TaskScheduler | null = null;

export function getScheduler(config?: RateLimitConfig): TaskScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new TaskScheduler(config);
  }
  return schedulerInstance;
}

export { TaskScheduler };
