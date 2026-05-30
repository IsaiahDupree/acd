/**
 * Cost Tracking Service
 * =====================
 * 
 * Tracks API usage costs for harness runs.
 * Monitors token usage, estimates costs, and provides budget alerts.
 */

import { EventEmitter } from 'events';
import { getClaudeApiKey, isOAuthToken } from '../config/env-config';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface CostEntry {
  id: string;
  projectId: string;
  sessionNumber: number;
  model: string;
  usage: TokenUsage;
  cost: number;
  timestamp: Date;
  metadata?: {
    featureId?: string;
    toolCalls?: number;
    duration?: number;
  };
}

export interface CostSummary {
  projectId: string;
  isOAuthToken?: boolean; // True if using Claude Code subscription (free)
  period: {
    start: Date;
    end: Date;
  };
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  entriesCount: number;
  byModel: Record<string, { cost: number; tokens: number }>;
  bySession: Record<number, { cost: number; tokens: number }>;
  dailyCosts: { date: string; cost: number }[];
}

export interface BudgetConfig {
  projectId: string;
  dailyLimit?: number;
  weeklyLimit?: number;
  monthlyLimit?: number;
  alertThreshold: number; // 0-1, e.g., 0.8 = alert at 80%
  pauseOnExceed: boolean;
}

// Model pricing (per 1M tokens) - Updated for Claude models
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'default': { input: 3.00, output: 15.00 },
};

class CostTrackingService extends EventEmitter {
  private entries: Map<string, CostEntry[]> = new Map();
  private budgets: Map<string, BudgetConfig> = new Map();
  private alerts: Map<string, { type: string; message: string; timestamp: Date }[]> = new Map();
  private isOAuthToken: boolean = false;

          constructor() {
            super();
            // Check if using Claude Code OAuth token (covered by subscription)
            // Use configurable environment variable names
            this.isOAuthToken = isOAuthToken();
          }

  /**
   * Calculate cost from token usage
   */
  calculateCost(model: string, usage: TokenUsage): number {
    // If using Claude Code OAuth token, costs are covered by subscription
    if (this.isOAuthToken) {
      return 0
    }
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    
    let cost = 0;
    cost += (usage.inputTokens / 1_000_000) * pricing.input;
    cost += (usage.outputTokens / 1_000_000) * pricing.output;
    
    if (usage.cacheReadTokens && pricing.cacheRead) {
      cost += (usage.cacheReadTokens / 1_000_000) * pricing.cacheRead;
    }
    if (usage.cacheWriteTokens && pricing.cacheWrite) {
      cost += (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
    }
    
    return Math.round(cost * 10000) / 10000; // Round to 4 decimal places
  }

  /**
   * Record token usage
   */
  recordUsage(
    projectId: string,
    sessionNumber: number,
    model: string,
    usage: TokenUsage,
    metadata?: CostEntry['metadata']
  ): CostEntry {
    const cost = this.calculateCost(model, usage);
    
    const entry: CostEntry = {
      id: `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      sessionNumber,
      model,
      usage,
      cost,
      timestamp: new Date(),
      metadata,
    };
    
    // Store entry
    const projectEntries = this.entries.get(projectId) || [];
    projectEntries.push(entry);
    this.entries.set(projectId, projectEntries);
    
    this.emit('cost:recorded', entry);
    
    // Check budget
    this.checkBudget(projectId);
    
    return entry;
  }

  /**
   * Get cost entries for a project
   */
  getEntries(projectId: string, options?: {
    limit?: number;
    since?: Date;
    sessionNumber?: number;
  }): CostEntry[] {
    let entries = this.entries.get(projectId) || [];
    
    if (options?.since) {
      entries = entries.filter(e => e.timestamp >= options.since!);
    }
    
    if (options?.sessionNumber !== undefined) {
      entries = entries.filter(e => e.sessionNumber === options.sessionNumber);
    }
    
    if (options?.limit) {
      entries = entries.slice(-options.limit);
    }
    
    return entries;
  }

  /**
   * Get cost summary for a project
   */
  getSummary(projectId: string, period?: { start: Date; end: Date }): CostSummary {
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    const start = period?.start || defaultStart;
    const end = period?.end || now;
    
    const entries = this.getEntries(projectId, { since: start })
      .filter(e => e.timestamp <= end);
    
    const byModel: Record<string, { cost: number; tokens: number }> = {};
    const bySession: Record<number, { cost: number; tokens: number }> = {};
    const dailyCostsMap: Record<string, number> = {};
    
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheTokens = 0;
    
    for (const entry of entries) {
      totalCost += entry.cost;
      totalInputTokens += entry.usage.inputTokens;
      totalOutputTokens += entry.usage.outputTokens;
      totalCacheTokens += (entry.usage.cacheReadTokens || 0) + (entry.usage.cacheWriteTokens || 0);
      
      // By model
      if (!byModel[entry.model]) {
        byModel[entry.model] = { cost: 0, tokens: 0 };
      }
      byModel[entry.model].cost += entry.cost;
      byModel[entry.model].tokens += entry.usage.inputTokens + entry.usage.outputTokens;
      
      // By session
      if (!bySession[entry.sessionNumber]) {
        bySession[entry.sessionNumber] = { cost: 0, tokens: 0 };
      }
      bySession[entry.sessionNumber].cost += entry.cost;
      bySession[entry.sessionNumber].tokens += entry.usage.inputTokens + entry.usage.outputTokens;
      
      // Daily
      const dateKey = entry.timestamp.toISOString().split('T')[0];
      dailyCostsMap[dateKey] = (dailyCostsMap[dateKey] || 0) + entry.cost;
    }
    
    const dailyCosts = Object.entries(dailyCostsMap)
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return {
      projectId,
      isOAuthToken: this.isOAuthToken,
      period: { start, end },
      totalCost: Math.round(totalCost * 100) / 100,
      totalInputTokens,
      totalOutputTokens,
      totalCacheTokens,
      entriesCount: entries.length,
      byModel,
      bySession,
      dailyCosts,
    };
  }

  /**
   * Set budget configuration
   */
  setBudget(config: BudgetConfig): BudgetConfig {
    this.budgets.set(config.projectId, config);
    this.emit('budget:set', config);
    return config;
  }

  /**
   * Get budget configuration
   */
  getBudget(projectId: string): BudgetConfig | undefined {
    return this.budgets.get(projectId);
  }

  /**
   * Check if budget is exceeded
   */
  checkBudget(projectId: string): { exceeded: boolean; usage: number; limit: number; type: string } | null {
    const budget = this.budgets.get(projectId);
    if (!budget) return null;
    
    const now = new Date();
    
    // Check daily
    if (budget.dailyLimit) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dailyCost = this.getCostSince(projectId, dayStart);
      
      if (dailyCost >= budget.dailyLimit * budget.alertThreshold) {
        this.addAlert(projectId, 'daily_threshold', `Daily cost ($${dailyCost.toFixed(2)}) approaching limit ($${budget.dailyLimit})`);
      }
      
      if (dailyCost >= budget.dailyLimit) {
        this.addAlert(projectId, 'daily_exceeded', `Daily budget exceeded: $${dailyCost.toFixed(2)} / $${budget.dailyLimit}`);
        if (budget.pauseOnExceed) {
          this.emit('budget:exceeded', { projectId, type: 'daily', usage: dailyCost, limit: budget.dailyLimit });
        }
        return { exceeded: true, usage: dailyCost, limit: budget.dailyLimit, type: 'daily' };
      }
    }
    
    // Check weekly
    if (budget.weeklyLimit) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weeklyCost = this.getCostSince(projectId, weekStart);
      
      if (weeklyCost >= budget.weeklyLimit * budget.alertThreshold) {
        this.addAlert(projectId, 'weekly_threshold', `Weekly cost ($${weeklyCost.toFixed(2)}) approaching limit ($${budget.weeklyLimit})`);
      }
      
      if (weeklyCost >= budget.weeklyLimit) {
        this.addAlert(projectId, 'weekly_exceeded', `Weekly budget exceeded: $${weeklyCost.toFixed(2)} / $${budget.weeklyLimit}`);
        if (budget.pauseOnExceed) {
          this.emit('budget:exceeded', { projectId, type: 'weekly', usage: weeklyCost, limit: budget.weeklyLimit });
        }
        return { exceeded: true, usage: weeklyCost, limit: budget.weeklyLimit, type: 'weekly' };
      }
    }
    
    // Check monthly
    if (budget.monthlyLimit) {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthlyCost = this.getCostSince(projectId, monthStart);
      
      if (monthlyCost >= budget.monthlyLimit * budget.alertThreshold) {
        this.addAlert(projectId, 'monthly_threshold', `Monthly cost ($${monthlyCost.toFixed(2)}) approaching limit ($${budget.monthlyLimit})`);
      }
      
      if (monthlyCost >= budget.monthlyLimit) {
        this.addAlert(projectId, 'monthly_exceeded', `Monthly budget exceeded: $${monthlyCost.toFixed(2)} / $${budget.monthlyLimit}`);
        if (budget.pauseOnExceed) {
          this.emit('budget:exceeded', { projectId, type: 'monthly', usage: monthlyCost, limit: budget.monthlyLimit });
        }
        return { exceeded: true, usage: monthlyCost, limit: budget.monthlyLimit, type: 'monthly' };
      }
    }
    
    return { exceeded: false, usage: 0, limit: 0, type: 'none' };
  }

  /**
   * Get cost since a date
   */
  private getCostSince(projectId: string, since: Date): number {
    const entries = this.getEntries(projectId, { since });
    return entries.reduce((sum, e) => sum + e.cost, 0);
  }

  /**
   * Add alert
   */
  private addAlert(projectId: string, type: string, message: string): void {
    const projectAlerts = this.alerts.get(projectId) || [];
    
    // Avoid duplicate alerts within 1 hour
    const recentAlert = projectAlerts.find(
      a => a.type === type && (Date.now() - a.timestamp.getTime()) < 60 * 60 * 1000
    );
    
    if (!recentAlert) {
      const alert = { type, message, timestamp: new Date() };
      projectAlerts.push(alert);
      this.alerts.set(projectId, projectAlerts);
      this.emit('alert', { projectId, ...alert });
    }
  }

  /**
   * Get alerts for a project
   */
  getAlerts(projectId: string, limit = 20): { type: string; message: string; timestamp: Date }[] {
    const alerts = this.alerts.get(projectId) || [];
    return alerts.slice(-limit);
  }

  /**
   * Estimate cost for a harness run
   */
  estimateRunCost(
    model: string,
    estimatedSessions: number,
    avgTokensPerSession: { input: number; output: number }
  ): { totalCost: number; perSession: number; breakdown: object } {
    const usage: TokenUsage = {
      inputTokens: avgTokensPerSession.input,
      outputTokens: avgTokensPerSession.output,
    };
    
    const perSession = this.calculateCost(model, usage);
    const totalCost = perSession * estimatedSessions;
    
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    
    return {
      totalCost: Math.round(totalCost * 100) / 100,
      perSession: Math.round(perSession * 100) / 100,
      breakdown: {
        model,
        sessions: estimatedSessions,
        inputTokensPerSession: avgTokensPerSession.input,
        outputTokensPerSession: avgTokensPerSession.output,
        inputCostPer1M: pricing.input,
        outputCostPer1M: pricing.output,
      },
    };
  }

  /**
   * Get session cost
   */
  getSessionCost(projectId: string, sessionNumber: number): {
    cost: number;
    tokens: TokenUsage;
    entries: number;
  } {
    const entries = this.getEntries(projectId, { sessionNumber });
    
    const tokens: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    
    let cost = 0;
    
    for (const entry of entries) {
      cost += entry.cost;
      tokens.inputTokens += entry.usage.inputTokens;
      tokens.outputTokens += entry.usage.outputTokens;
      tokens.cacheReadTokens! += entry.usage.cacheReadTokens || 0;
      tokens.cacheWriteTokens! += entry.usage.cacheWriteTokens || 0;
    }
    
    return {
      cost: Math.round(cost * 100) / 100,
      tokens,
      entries: entries.length,
    };
  }

  /**
   * Get available models with pricing
   */
  getModelPricing(): Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> {
    return { ...MODEL_PRICING };
  }
}

// Singleton
let instance: CostTrackingService | null = null;

export function getCostTracking(): CostTrackingService {
  if (!instance) {
    instance = new CostTrackingService();
  }
  return instance;
}

export { CostTrackingService };
