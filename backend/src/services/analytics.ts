/**
 * Analytics Service
 * =================
 * 
 * Provides advanced analytics and reporting for harness runs.
 * Tracks performance metrics, generates reports, and identifies trends.
 */

import { EventEmitter } from 'events';

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface PerformanceMetrics {
  avgSessionDuration: number;
  avgFeaturesPerSession: number;
  avgCostPerFeature: number;
  successRate: number;
  errorRate: number;
  tokensPerFeature: number;
}

export interface TrendData {
  date: string;
  value: number;
}

export interface ProjectAnalytics {
  projectId: string;
  timeRange: TimeRange;
  performance: PerformanceMetrics;
  trends: {
    sessions: TrendData[];
    features: TrendData[];
    costs: TrendData[];
    successRate: TrendData[];
  };
  topErrors: { message: string; count: number }[];
  featureBreakdown: {
    category: string;
    completed: number;
    pending: number;
    avgTime: number;
  }[];
}

export interface DashboardReport {
  generatedAt: Date;
  timeRange: TimeRange;
  summary: {
    totalProjects: number;
    activeHarnesses: number;
    totalFeatures: number;
    completedFeatures: number;
    totalCost: number;
    totalSessions: number;
  };
  projectPerformance: {
    projectId: string;
    projectName: string;
    successRate: number;
    costEfficiency: number;
    velocity: number;
  }[];
  trends: {
    daily: { date: string; sessions: number; features: number; cost: number }[];
    weekly: { week: string; sessions: number; features: number; cost: number }[];
  };
  insights: string[];
}

interface AnalyticsEvent {
  id: string;
  projectId: string;
  type: 'session_start' | 'session_end' | 'feature_start' | 'feature_complete' | 'feature_fail' | 'error' | 'cost';
  timestamp: Date;
  data: Record<string, any>;
}

class AnalyticsService extends EventEmitter {
  private events: Map<string, AnalyticsEvent[]> = new Map();
  private cache: Map<string, { data: any; expiry: Date }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
  }

  /**
   * Record an analytics event
   */
  recordEvent(projectId: string, type: AnalyticsEvent['type'], data: Record<string, any>): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      type,
      timestamp: new Date(),
      data,
    };

    const projectEvents = this.events.get(projectId) || [];
    projectEvents.push(event);
    this.events.set(projectId, projectEvents);

    // Invalidate cache
    this.invalidateCache(projectId);

    this.emit('event', event);
    return event;
  }

  /**
   * Get project analytics
   */
  getProjectAnalytics(projectId: string, timeRange?: TimeRange): ProjectAnalytics {
    const cacheKey = `analytics:${projectId}:${timeRange?.start?.toISOString()}:${timeRange?.end?.toISOString()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const range: TimeRange = timeRange || {
      start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      end: now,
    };

    const events = this.getEventsInRange(projectId, range);
    
    const analytics: ProjectAnalytics = {
      projectId,
      timeRange: range,
      performance: this.calculatePerformance(events),
      trends: this.calculateTrends(events, range),
      topErrors: this.getTopErrors(events),
      featureBreakdown: this.getFeatureBreakdown(events),
    };

    this.setCache(cacheKey, analytics);
    return analytics;
  }

  /**
   * Generate dashboard report
   */
  generateDashboardReport(projectIds: string[], timeRange?: TimeRange): DashboardReport {
    const now = new Date();
    const range: TimeRange = timeRange || {
      start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      end: now,
    };

    // Aggregate all events
    const allEvents: AnalyticsEvent[] = [];
    for (const projectId of projectIds) {
      allEvents.push(...this.getEventsInRange(projectId, range));
    }

    // Calculate summary
    const sessionEvents = allEvents.filter(e => e.type === 'session_start');
    const featureCompleteEvents = allEvents.filter(e => e.type === 'feature_complete');
    const costEvents = allEvents.filter(e => e.type === 'cost');

    const totalCost = costEvents.reduce((sum, e) => sum + (e.data.cost || 0), 0);

    // Calculate project performance
    const projectPerformance = projectIds.map(projectId => {
      const projectEvents = allEvents.filter(e => e.projectId === projectId);
      const perf = this.calculatePerformance(projectEvents);
      
      return {
        projectId,
        projectName: projectId, // Would need project name from manager
        successRate: perf.successRate,
        costEfficiency: perf.avgCostPerFeature > 0 ? 1 / perf.avgCostPerFeature : 0,
        velocity: perf.avgFeaturesPerSession,
      };
    });

    // Calculate trends
    const dailyMap = new Map<string, { sessions: number; features: number; cost: number }>();
    
    for (const event of allEvents) {
      const dateKey = event.timestamp.toISOString().split('T')[0];
      const entry = dailyMap.get(dateKey) || { sessions: 0, features: 0, cost: 0 };
      
      if (event.type === 'session_start') entry.sessions++;
      if (event.type === 'feature_complete') entry.features++;
      if (event.type === 'cost') entry.cost += event.data.cost || 0;
      
      dailyMap.set(dateKey, entry);
    }

    const daily = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Generate insights
    const insights = this.generateInsights(allEvents, projectPerformance);

    const report: DashboardReport = {
      generatedAt: now,
      timeRange: range,
      summary: {
        totalProjects: projectIds.length,
        activeHarnesses: sessionEvents.filter(e => 
          now.getTime() - e.timestamp.getTime() < 24 * 60 * 60 * 1000
        ).length,
        totalFeatures: allEvents.filter(e => e.type === 'feature_start').length,
        completedFeatures: featureCompleteEvents.length,
        totalCost: Math.round(totalCost * 100) / 100,
        totalSessions: sessionEvents.length,
      },
      projectPerformance,
      trends: {
        daily,
        weekly: this.aggregateToWeekly(daily),
      },
      insights,
    };

    return report;
  }

  /**
   * Get real-time metrics
   */
  getRealTimeMetrics(projectId: string): {
    activeSessions: number;
    featuresInProgress: number;
    recentErrors: number;
    currentCost: number;
    lastActivity: Date | null;
  } {
    const events = this.events.get(projectId) || [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentEvents = events.filter(e => e.timestamp >= oneHourAgo);

    // Count active sessions (started but not ended)
    const sessionStarts = events.filter(e => e.type === 'session_start');
    const sessionEnds = events.filter(e => e.type === 'session_end');
    const activeSessions = sessionStarts.length - sessionEnds.length;

    // Features in progress
    const featureStarts = events.filter(e => e.type === 'feature_start');
    const featureEnds = events.filter(e => e.type === 'feature_complete' || e.type === 'feature_fail');
    const featuresInProgress = featureStarts.length - featureEnds.length;

    // Recent errors (last hour)
    const recentErrors = recentEvents.filter(e => e.type === 'error').length;

    // Current day cost
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayCost = events
      .filter(e => e.type === 'cost' && e.timestamp >= dayStart)
      .reduce((sum, e) => sum + (e.data.cost || 0), 0);

    // Last activity
    const lastEvent = events[events.length - 1];

    return {
      activeSessions: Math.max(0, activeSessions),
      featuresInProgress: Math.max(0, featuresInProgress),
      recentErrors,
      currentCost: Math.round(todayCost * 100) / 100,
      lastActivity: lastEvent?.timestamp || null,
    };
  }

  /**
   * Export analytics data
   */
  exportData(projectId: string, format: 'json' | 'csv' = 'json'): string {
    const events = this.events.get(projectId) || [];
    
    if (format === 'csv') {
      const headers = ['id', 'type', 'timestamp', 'data'];
      const rows = events.map(e => [
        e.id,
        e.type,
        e.timestamp.toISOString(),
        JSON.stringify(e.data),
      ]);
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }
    
    return JSON.stringify(events, null, 2);
  }

  private getEventsInRange(projectId: string, range: TimeRange): AnalyticsEvent[] {
    const events = this.events.get(projectId) || [];
    return events.filter(e => e.timestamp >= range.start && e.timestamp <= range.end);
  }

  private calculatePerformance(events: AnalyticsEvent[]): PerformanceMetrics {
    const sessionStarts = events.filter(e => e.type === 'session_start');
    const sessionEnds = events.filter(e => e.type === 'session_end');
    const featureCompletes = events.filter(e => e.type === 'feature_complete');
    const featureFails = events.filter(e => e.type === 'feature_fail');
    const errors = events.filter(e => e.type === 'error');
    const costs = events.filter(e => e.type === 'cost');

    const totalSessions = Math.min(sessionStarts.length, sessionEnds.length);
    const totalFeatures = featureCompletes.length + featureFails.length;
    const totalCost = costs.reduce((sum, e) => sum + (e.data.cost || 0), 0);
    const totalTokens = costs.reduce((sum, e) => 
      sum + (e.data.inputTokens || 0) + (e.data.outputTokens || 0), 0);

    // Calculate average session duration
    let totalDuration = 0;
    for (let i = 0; i < Math.min(sessionStarts.length, sessionEnds.length); i++) {
      totalDuration += sessionEnds[i].timestamp.getTime() - sessionStarts[i].timestamp.getTime();
    }
    const avgSessionDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;

    return {
      avgSessionDuration,
      avgFeaturesPerSession: totalSessions > 0 ? featureCompletes.length / totalSessions : 0,
      avgCostPerFeature: featureCompletes.length > 0 ? totalCost / featureCompletes.length : 0,
      successRate: totalFeatures > 0 ? (featureCompletes.length / totalFeatures) * 100 : 0,
      errorRate: totalSessions > 0 ? (errors.length / totalSessions) * 100 : 0,
      tokensPerFeature: featureCompletes.length > 0 ? totalTokens / featureCompletes.length : 0,
    };
  }

  private calculateTrends(events: AnalyticsEvent[], range: TimeRange): ProjectAnalytics['trends'] {
    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.ceil((range.end.getTime() - range.start.getTime()) / dayMs);

    const sessions: TrendData[] = [];
    const features: TrendData[] = [];
    const costs: TrendData[] = [];
    const successRate: TrendData[] = [];

    for (let i = 0; i < days; i++) {
      const dayStart = new Date(range.start.getTime() + i * dayMs);
      const dayEnd = new Date(dayStart.getTime() + dayMs);
      const dateStr = dayStart.toISOString().split('T')[0];

      const dayEvents = events.filter(e => e.timestamp >= dayStart && e.timestamp < dayEnd);

      sessions.push({
        date: dateStr,
        value: dayEvents.filter(e => e.type === 'session_start').length,
      });

      features.push({
        date: dateStr,
        value: dayEvents.filter(e => e.type === 'feature_complete').length,
      });

      costs.push({
        date: dateStr,
        value: dayEvents
          .filter(e => e.type === 'cost')
          .reduce((sum, e) => sum + (e.data.cost || 0), 0),
      });

      const completed = dayEvents.filter(e => e.type === 'feature_complete').length;
      const failed = dayEvents.filter(e => e.type === 'feature_fail').length;
      const total = completed + failed;

      successRate.push({
        date: dateStr,
        value: total > 0 ? (completed / total) * 100 : 0,
      });
    }

    return { sessions, features, costs, successRate };
  }

  private getTopErrors(events: AnalyticsEvent[]): { message: string; count: number }[] {
    const errorCounts = new Map<string, number>();

    for (const event of events.filter(e => e.type === 'error')) {
      const message = event.data.message || 'Unknown error';
      errorCounts.set(message, (errorCounts.get(message) || 0) + 1);
    }

    return Array.from(errorCounts.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getFeatureBreakdown(events: AnalyticsEvent[]): ProjectAnalytics['featureBreakdown'] {
    const categories = new Map<string, { completed: number; pending: number; totalTime: number; count: number }>();

    for (const event of events.filter(e => e.type === 'feature_complete' || e.type === 'feature_fail')) {
      const category = event.data.category || 'uncategorized';
      const entry = categories.get(category) || { completed: 0, pending: 0, totalTime: 0, count: 0 };

      if (event.type === 'feature_complete') {
        entry.completed++;
        entry.totalTime += event.data.duration || 0;
        entry.count++;
      } else {
        entry.pending++;
      }

      categories.set(category, entry);
    }

    return Array.from(categories.entries()).map(([category, data]) => ({
      category,
      completed: data.completed,
      pending: data.pending,
      avgTime: data.count > 0 ? data.totalTime / data.count : 0,
    }));
  }

  private aggregateToWeekly(daily: { date: string; sessions: number; features: number; cost: number }[]): 
    { week: string; sessions: number; features: number; cost: number }[] {
    const weeks = new Map<string, { sessions: number; features: number; cost: number }>();

    for (const day of daily) {
      const date = new Date(day.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      const entry = weeks.get(weekKey) || { sessions: 0, features: 0, cost: 0 };
      entry.sessions += day.sessions;
      entry.features += day.features;
      entry.cost += day.cost;
      weeks.set(weekKey, entry);
    }

    return Array.from(weeks.entries())
      .map(([week, data]) => ({ week, ...data }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }

  private generateInsights(events: AnalyticsEvent[], projectPerformance: any[]): string[] {
    const insights: string[] = [];

    // Best performing project
    const bestProject = projectPerformance.reduce((best, p) => 
      p.successRate > best.successRate ? p : best, projectPerformance[0]);
    if (bestProject && bestProject.successRate > 0) {
      insights.push(`🏆 ${bestProject.projectName} has the highest success rate at ${bestProject.successRate.toFixed(1)}%`);
    }

    // Most cost-efficient project
    const mostEfficient = projectPerformance.reduce((best, p) => 
      p.costEfficiency > best.costEfficiency ? p : best, projectPerformance[0]);
    if (mostEfficient && mostEfficient.costEfficiency > 0) {
      insights.push(`💰 ${mostEfficient.projectName} is the most cost-efficient project`);
    }

    // High error rate warning
    const errorEvents = events.filter(e => e.type === 'error');
    const sessionEvents = events.filter(e => e.type === 'session_start');
    if (sessionEvents.length > 0) {
      const errorRate = (errorEvents.length / sessionEvents.length) * 100;
      if (errorRate > 20) {
        insights.push(`⚠️ High error rate detected (${errorRate.toFixed(1)}%) - review error logs`);
      }
    }

    // Productivity trend
    const recentFeatures = events
      .filter(e => e.type === 'feature_complete')
      .filter(e => new Date().getTime() - e.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000);
    const olderFeatures = events
      .filter(e => e.type === 'feature_complete')
      .filter(e => {
        const age = new Date().getTime() - e.timestamp.getTime();
        return age >= 7 * 24 * 60 * 60 * 1000 && age < 14 * 24 * 60 * 60 * 1000;
      });

    if (olderFeatures.length > 0 && recentFeatures.length > olderFeatures.length * 1.2) {
      insights.push(`📈 Feature completion velocity increased by ${Math.round((recentFeatures.length / olderFeatures.length - 1) * 100)}% this week`);
    }

    return insights;
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > new Date()) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expiry: new Date(Date.now() + this.cacheTimeout),
    });
  }

  private invalidateCache(projectId: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(projectId)) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton
let instance: AnalyticsService | null = null;

export function getAnalytics(): AnalyticsService {
  if (!instance) {
    instance = new AnalyticsService();
  }
  return instance;
}

export { AnalyticsService };
