/**
 * User Event Tracking Service
 * ============================
 * 
 * Sophisticated user event tracking system for web applications.
 * Designed to be embedded in all target web apps for comprehensive analytics.
 * 
 * Features:
 * - Automatic page view tracking
 * - Click and interaction tracking
 * - Scroll depth tracking
 * - Session management
 * - Funnel analysis support
 * - Custom event tracking
 * - User identification
 * - Attribution tracking (UTM, referrer)
 * - Performance metrics (Core Web Vitals)
 * - Error tracking
 * - Feature flag integration
 * - A/B test event support
 */

import { EventEmitter } from 'events';

// ==================== Types ====================

export interface UserIdentity {
  userId?: string;
  anonymousId: string;
  email?: string;
  traits?: Record<string, any>;
}

export interface SessionData {
  sessionId: string;
  startedAt: Date;
  lastActivityAt: Date;
  pageViews: number;
  events: number;
  referrer?: string;
  utm?: UTMParams;
  landingPage: string;
  device: DeviceInfo;
}

export interface UTMParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export interface DeviceInfo {
  type: 'desktop' | 'tablet' | 'mobile' | 'unknown';
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  language: string;
  timezone: string;
}

export interface PageViewEvent {
  type: 'page_view';
  url: string;
  path: string;
  title: string;
  referrer?: string;
  timestamp: Date;
  duration?: number;
  scrollDepth?: number;
}

export interface ClickEvent {
  type: 'click';
  element: string;
  elementId?: string;
  elementClass?: string;
  elementText?: string;
  href?: string;
  timestamp: Date;
  position: { x: number; y: number };
}

export interface FormEvent {
  type: 'form_submit' | 'form_start' | 'form_abandon';
  formId?: string;
  formName?: string;
  fields?: string[];
  timestamp: Date;
  duration?: number;
}

export interface CustomEvent {
  type: 'custom';
  name: string;
  category?: string;
  label?: string;
  value?: number;
  properties?: Record<string, any>;
  timestamp: Date;
}

export interface ConversionEvent {
  type: 'conversion';
  name: string;
  value?: number;
  currency?: string;
  orderId?: string;
  products?: ProductInfo[];
  timestamp: Date;
}

export interface ProductInfo {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  variant?: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  stack?: string;
  source?: string;
  lineNumber?: number;
  columnNumber?: number;
  timestamp: Date;
}

export interface PerformanceEvent {
  type: 'performance';
  metric: 'LCP' | 'FID' | 'CLS' | 'TTFB' | 'FCP' | 'INP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: Date;
}

export interface FeatureFlagEvent {
  type: 'feature_flag';
  flagKey: string;
  variant: string;
  timestamp: Date;
}

export interface ABTestEvent {
  type: 'ab_test';
  experimentId: string;
  experimentName: string;
  variant: string;
  timestamp: Date;
}

export type TrackingEvent = 
  | PageViewEvent 
  | ClickEvent 
  | FormEvent 
  | CustomEvent 
  | ConversionEvent 
  | ErrorEvent 
  | PerformanceEvent
  | FeatureFlagEvent
  | ABTestEvent;

export interface TrackedEventRecord {
  id: string;
  projectId: string;
  event: TrackingEvent;
  user: UserIdentity;
  session: SessionData;
  context: EventContext;
}

export interface EventContext {
  appVersion?: string;
  environment: 'development' | 'staging' | 'production';
  timestamp: Date;
  ip?: string;
  userAgent?: string;
}

export interface FunnelStep {
  name: string;
  eventName: string;
  eventProperties?: Record<string, any>;
}

export interface FunnelDefinition {
  id: string;
  name: string;
  steps: FunnelStep[];
  windowDays: number;
}

export interface FunnelAnalysis {
  funnelId: string;
  funnelName: string;
  steps: {
    name: string;
    count: number;
    conversionRate: number;
    dropoffRate: number;
  }[];
  overallConversionRate: number;
  avgTimeToConvert: number;
}

export interface CohortDefinition {
  id: string;
  name: string;
  criteria: {
    event?: string;
    property?: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt' | 'exists';
    value?: any;
  }[];
}

export interface RetentionAnalysis {
  cohortDate: string;
  cohortSize: number;
  retention: {
    day: number;
    count: number;
    percentage: number;
  }[];
}

// ==================== Configuration ====================

export interface TrackingConfig {
  projectId: string;
  apiEndpoint?: string;
  autoTrack: {
    pageViews: boolean;
    clicks: boolean;
    forms: boolean;
    scrollDepth: boolean;
    performance: boolean;
    errors: boolean;
    outboundLinks: boolean;
  };
  sessionTimeout: number; // minutes
  batchSize: number;
  flushInterval: number; // milliseconds
  sampleRate: number; // 0-1
  respectDoNotTrack: boolean;
  cookieDomain?: string;
  excludePaths?: string[];
  maskSelectors?: string[];
  debug: boolean;
}

const DEFAULT_CONFIG: TrackingConfig = {
  projectId: '',
  autoTrack: {
    pageViews: true,
    clicks: true,
    forms: true,
    scrollDepth: true,
    performance: true,
    errors: true,
    outboundLinks: true,
  },
  sessionTimeout: 30,
  batchSize: 10,
  flushInterval: 5000,
  sampleRate: 1,
  respectDoNotTrack: true,
  debug: false,
};

// ==================== User Event Tracking Service ====================

class UserEventTrackingService extends EventEmitter {
  private config: TrackingConfig;
  private eventBuffer: TrackedEventRecord[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private sessions: Map<string, SessionData> = new Map();
  private users: Map<string, UserIdentity> = new Map();
  private funnels: Map<string, FunnelDefinition> = new Map();
  private userFunnelProgress: Map<string, Map<string, number>> = new Map();
  private eventStore: Map<string, TrackedEventRecord[]> = new Map();

  constructor(config: Partial<TrackingConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startFlushTimer();
  }

  // ==================== Configuration ====================

  configure(config: Partial<TrackingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TrackingConfig {
    return { ...this.config };
  }

  // ==================== User Management ====================

  identify(userId: string, traits?: Record<string, any>): void {
    const anonymousId = this.getOrCreateAnonymousId(userId);
    const user: UserIdentity = {
      userId,
      anonymousId,
      traits,
    };
    this.users.set(userId, user);
    this.emit('identify', user);

    this.trackEvent({
      type: 'custom',
      name: '$identify',
      properties: { userId, ...traits },
      timestamp: new Date(),
    }, userId);
  }

  alias(newId: string, previousId: string): void {
    const previousUser = this.users.get(previousId);
    if (previousUser) {
      this.users.set(newId, { ...previousUser, userId: newId });
      this.emit('alias', { newId, previousId });
    }
  }

  reset(): void {
    // Clear user identity (for logout)
    this.users.clear();
    this.emit('reset');
  }

  private getOrCreateAnonymousId(userId?: string): string {
    if (userId) {
      const existingUser = this.users.get(userId);
      if (existingUser) return existingUser.anonymousId;
    }
    return `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ==================== Session Management ====================

  startSession(userId?: string, context?: Partial<SessionData>): SessionData {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const session: SessionData = {
      sessionId,
      startedAt: now,
      lastActivityAt: now,
      pageViews: 0,
      events: 0,
      referrer: context?.referrer,
      utm: context?.utm,
      landingPage: context?.landingPage || '/',
      device: context?.device || this.getDefaultDeviceInfo(),
    };

    this.sessions.set(sessionId, session);
    this.emit('session_start', session);

    this.trackEvent({
      type: 'custom',
      name: '$session_start',
      properties: { sessionId },
      timestamp: now,
    }, userId);

    return session;
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const duration = Date.now() - session.startedAt.getTime();
      this.trackEvent({
        type: 'custom',
        name: '$session_end',
        properties: {
          sessionId,
          duration,
          pageViews: session.pageViews,
          events: session.events,
        },
        timestamp: new Date(),
      });
      this.sessions.delete(sessionId);
      this.emit('session_end', { ...session, duration });
    }
  }

  private getDefaultDeviceInfo(): DeviceInfo {
    return {
      type: 'unknown',
      browser: 'unknown',
      browserVersion: 'unknown',
      os: 'unknown',
      osVersion: 'unknown',
      screenWidth: 0,
      screenHeight: 0,
      viewportWidth: 0,
      viewportHeight: 0,
      language: 'en',
      timezone: 'UTC',
    };
  }

  // ==================== Event Tracking ====================

  trackEvent(event: TrackingEvent, userId?: string, sessionId?: string): TrackedEventRecord {
    const user = this.getUser(userId);
    const session = this.getSession(sessionId);

    const record: TrackedEventRecord = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId: this.config.projectId,
      event,
      user,
      session,
      context: {
        environment: process.env.NODE_ENV as 'development' | 'staging' | 'production' || 'development',
        timestamp: new Date(),
      },
    };

    // Update session activity
    if (session) {
      session.lastActivityAt = new Date();
      session.events++;
      if (event.type === 'page_view') session.pageViews++;
    }

    // Store event
    this.storeEvent(record);

    // Buffer for batch sending
    this.eventBuffer.push(record);
    if (this.eventBuffer.length >= this.config.batchSize) {
      this.flush();
    }

    // Check funnel progress
    this.updateFunnelProgress(record);

    this.emit('event', record);
    return record;
  }

  // ==================== Convenience Tracking Methods ====================

  trackPageView(url: string, title: string, referrer?: string, userId?: string): TrackedEventRecord {
    const path = new URL(url, 'http://localhost').pathname;
    return this.trackEvent({
      type: 'page_view',
      url,
      path,
      title,
      referrer,
      timestamp: new Date(),
    }, userId);
  }

  trackClick(element: string, properties?: Partial<ClickEvent>, userId?: string): TrackedEventRecord {
    return this.trackEvent({
      type: 'click',
      element,
      elementId: properties?.elementId,
      elementClass: properties?.elementClass,
      elementText: properties?.elementText,
      href: properties?.href,
      position: properties?.position || { x: 0, y: 0 },
      timestamp: new Date(),
    }, userId);
  }

  trackFormSubmit(formId: string, fields?: string[], duration?: number, userId?: string): TrackedEventRecord {
    return this.trackEvent({
      type: 'form_submit',
      formId,
      fields,
      duration,
      timestamp: new Date(),
    }, userId);
  }

  trackConversion(name: string, value?: number, properties?: Partial<ConversionEvent>, userId?: string): TrackedEventRecord {
    return this.trackEvent({
      type: 'conversion',
      name,
      value,
      currency: properties?.currency,
      orderId: properties?.orderId,
      products: properties?.products,
      timestamp: new Date(),
    }, userId);
  }

  trackError(message: string, stack?: string, source?: string, userId?: string): TrackedEventRecord {
    return this.trackEvent({
      type: 'error',
      message,
      stack,
      source,
      timestamp: new Date(),
    }, userId);
  }

  trackPerformance(metric: PerformanceEvent['metric'], value: number, userId?: string): TrackedEventRecord {
    let rating: 'good' | 'needs-improvement' | 'poor';
    
    // Web Vitals thresholds
    const thresholds: Record<PerformanceEvent['metric'], [number, number]> = {
      LCP: [2500, 4000],
      FID: [100, 300],
      CLS: [0.1, 0.25],
      TTFB: [800, 1800],
      FCP: [1800, 3000],
      INP: [200, 500],
    };

    const [good, poor] = thresholds[metric];
    rating = value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor';

    return this.trackEvent({
      type: 'performance',
      metric,
      value,
      rating,
      timestamp: new Date(),
    }, userId);
  }

  trackFeatureFlag(flagKey: string, variant: string, userId?: string): TrackedEventRecord {
    return this.trackEvent({
      type: 'feature_flag',
      flagKey,
      variant,
      timestamp: new Date(),
    }, userId);
  }

  trackABTest(experimentId: string, experimentName: string, variant: string, userId?: string): TrackedEventRecord {
    return this.trackEvent({
      type: 'ab_test',
      experimentId,
      experimentName,
      variant,
      timestamp: new Date(),
    }, userId);
  }

  track(eventName: string, properties?: Record<string, any>, userId?: string): TrackedEventRecord {
    return this.trackEvent({
      type: 'custom',
      name: eventName,
      properties,
      timestamp: new Date(),
    }, userId);
  }

  // ==================== Funnel Analysis ====================

  defineFunnel(funnel: FunnelDefinition): void {
    this.funnels.set(funnel.id, funnel);
    this.emit('funnel_defined', funnel);
  }

  analyzeFunnel(funnelId: string, timeRange?: { start: Date; end: Date }): FunnelAnalysis | null {
    const funnel = this.funnels.get(funnelId);
    if (!funnel) return null;

    const now = new Date();
    const range = timeRange || {
      start: new Date(now.getTime() - funnel.windowDays * 24 * 60 * 60 * 1000),
      end: now,
    };

    // Get all events in range
    const allEvents: TrackedEventRecord[] = [];
    for (const [, events] of this.eventStore) {
      allEvents.push(...events.filter(e => 
        e.context.timestamp >= range.start && e.context.timestamp <= range.end
      ));
    }

    // Group by user
    const userEvents = new Map<string, TrackedEventRecord[]>();
    for (const event of allEvents) {
      const userId = event.user.userId || event.user.anonymousId;
      const existing = userEvents.get(userId) || [];
      existing.push(event);
      userEvents.set(userId, existing);
    }

    // Analyze funnel steps
    const stepCounts: number[] = new Array(funnel.steps.length).fill(0);
    const timeToConvert: number[] = [];

    for (const [, events] of userEvents) {
      const sortedEvents = events.sort((a, b) => 
        a.context.timestamp.getTime() - b.context.timestamp.getTime()
      );

      let currentStep = 0;
      let firstStepTime: Date | null = null;

      for (const event of sortedEvents) {
        if (currentStep >= funnel.steps.length) break;

        const step = funnel.steps[currentStep];
        const eventName = event.event.type === 'custom' 
          ? (event.event as CustomEvent).name 
          : event.event.type;

        if (eventName === step.eventName) {
          stepCounts[currentStep]++;
          if (currentStep === 0) firstStepTime = event.context.timestamp;
          if (currentStep === funnel.steps.length - 1 && firstStepTime) {
            timeToConvert.push(event.context.timestamp.getTime() - firstStepTime.getTime());
          }
          currentStep++;
        }
      }
    }

    // Calculate metrics
    const steps = funnel.steps.map((step, i) => {
      const count = stepCounts[i];
      const previousCount = i === 0 ? userEvents.size : stepCounts[i - 1];
      const conversionRate = previousCount > 0 ? (count / previousCount) * 100 : 0;
      const dropoffRate = 100 - conversionRate;

      return {
        name: step.name,
        count,
        conversionRate,
        dropoffRate,
      };
    });

    const overallConversionRate = userEvents.size > 0 
      ? (stepCounts[stepCounts.length - 1] / userEvents.size) * 100 
      : 0;

    const avgTimeToConvert = timeToConvert.length > 0
      ? timeToConvert.reduce((a, b) => a + b, 0) / timeToConvert.length
      : 0;

    return {
      funnelId: funnel.id,
      funnelName: funnel.name,
      steps,
      overallConversionRate,
      avgTimeToConvert,
    };
  }

  private updateFunnelProgress(record: TrackedEventRecord): void {
    const userId = record.user.userId || record.user.anonymousId;
    
    for (const [funnelId, funnel] of this.funnels) {
      let userProgress = this.userFunnelProgress.get(userId);
      if (!userProgress) {
        userProgress = new Map();
        this.userFunnelProgress.set(userId, userProgress);
      }

      const currentStep = userProgress.get(funnelId) ?? 0;
      if (currentStep >= funnel.steps.length) continue;

      const step = funnel.steps[currentStep];
      const eventName = record.event.type === 'custom'
        ? (record.event as CustomEvent).name
        : record.event.type;

      if (eventName === step.eventName) {
        userProgress.set(funnelId, currentStep + 1);
        
        this.emit('funnel_step_complete', {
          funnelId,
          funnelName: funnel.name,
          stepIndex: currentStep,
          stepName: step.name,
          userId,
          isComplete: currentStep + 1 === funnel.steps.length,
        });
      }
    }
  }

  // ==================== Retention Analysis ====================

  analyzeRetention(
    cohortEvent: string,
    returnEvent: string,
    timeRange: { start: Date; end: Date },
    granularity: 'day' | 'week' = 'day'
  ): RetentionAnalysis[] {
    const allEvents: TrackedEventRecord[] = [];
    for (const [, events] of this.eventStore) {
      allEvents.push(...events.filter(e =>
        e.context.timestamp >= timeRange.start && e.context.timestamp <= timeRange.end
      ));
    }

    // Group cohort events by date
    const cohorts = new Map<string, Set<string>>();
    const userFirstEvent = new Map<string, Date>();

    for (const event of allEvents) {
      const eventName = event.event.type === 'custom'
        ? (event.event as CustomEvent).name
        : event.event.type;

      if (eventName === cohortEvent) {
        const userId = event.user.userId || event.user.anonymousId;
        const dateKey = this.getDateKey(event.context.timestamp, granularity);

        if (!userFirstEvent.has(userId)) {
          userFirstEvent.set(userId, event.context.timestamp);
          const cohort = cohorts.get(dateKey) || new Set();
          cohort.add(userId);
          cohorts.set(dateKey, cohort);
        }
      }
    }

    // Calculate retention for each cohort
    const results: RetentionAnalysis[] = [];

    for (const [cohortDate, cohortUsers] of cohorts) {
      const retention: { day: number; count: number; percentage: number }[] = [];
      const cohortStartDate = new Date(cohortDate);

      // Track return events per user
      const userReturns = new Map<string, Set<number>>();

      for (const event of allEvents) {
        const eventName = event.event.type === 'custom'
          ? (event.event as CustomEvent).name
          : event.event.type;

        if (eventName === returnEvent) {
          const userId = event.user.userId || event.user.anonymousId;
          if (cohortUsers.has(userId)) {
            const daysSinceCohort = Math.floor(
              (event.context.timestamp.getTime() - cohortStartDate.getTime()) / (24 * 60 * 60 * 1000)
            );
            
            if (daysSinceCohort >= 0) {
              const returns = userReturns.get(userId) || new Set();
              returns.add(daysSinceCohort);
              userReturns.set(userId, returns);
            }
          }
        }
      }

      // Calculate retention for each day
      for (let day = 0; day <= 30; day++) {
        let count = 0;
        for (const returns of userReturns.values()) {
          if (returns.has(day)) count++;
        }
        retention.push({
          day,
          count,
          percentage: cohortUsers.size > 0 ? (count / cohortUsers.size) * 100 : 0,
        });
      }

      results.push({
        cohortDate,
        cohortSize: cohortUsers.size,
        retention,
      });
    }

    return results;
  }

  private getDateKey(date: Date, granularity: 'day' | 'week'): string {
    if (granularity === 'day') {
      return date.toISOString().split('T')[0];
    }
    // Get week start (Sunday)
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
  }

  // ==================== Query Events ====================

  getEvents(
    projectId: string,
    filters?: {
      eventType?: TrackingEvent['type'];
      userId?: string;
      sessionId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): TrackedEventRecord[] {
    const projectEvents = this.eventStore.get(projectId) || [];
    
    let filtered = [...projectEvents];

    if (filters?.eventType) {
      filtered = filtered.filter(e => e.event.type === filters.eventType);
    }
    if (filters?.userId) {
      filtered = filtered.filter(e => 
        e.user.userId === filters.userId || e.user.anonymousId === filters.userId
      );
    }
    if (filters?.sessionId) {
      filtered = filtered.filter(e => e.session.sessionId === filters.sessionId);
    }
    if (filters?.startDate) {
      filtered = filtered.filter(e => e.context.timestamp >= filters.startDate!);
    }
    if (filters?.endDate) {
      filtered = filtered.filter(e => e.context.timestamp <= filters.endDate!);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.context.timestamp.getTime() - a.context.timestamp.getTime());

    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  getEventCounts(
    projectId: string,
    eventName: string,
    groupBy: 'day' | 'week' | 'month' = 'day',
    timeRange?: { start: Date; end: Date }
  ): { date: string; count: number }[] {
    const projectEvents = this.eventStore.get(projectId) || [];
    const now = new Date();
    const range = timeRange || {
      start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      end: now,
    };

    const filtered = projectEvents.filter(e => {
      const name = e.event.type === 'custom' 
        ? (e.event as CustomEvent).name 
        : e.event.type;
      return name === eventName &&
        e.context.timestamp >= range.start &&
        e.context.timestamp <= range.end;
    });

    const counts = new Map<string, number>();

    for (const event of filtered) {
      let key: string;
      const date = event.context.timestamp;

      if (groupBy === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const d = new Date(date);
        d.setDate(d.getDate() - d.getDay());
        key = d.toISOString().split('T')[0];
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // ==================== Internal Methods ====================

  private getUser(userId?: string): UserIdentity {
    if (userId) {
      const user = this.users.get(userId);
      if (user) return user;
    }
    return {
      anonymousId: this.getOrCreateAnonymousId(userId),
    };
  }

  private getSession(sessionId?: string): SessionData {
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) return session;
    }
    // Return default session if none exists
    return this.startSession();
  }

  private storeEvent(record: TrackedEventRecord): void {
    const events = this.eventStore.get(record.projectId) || [];
    events.push(record);
    this.eventStore.set(record.projectId, events);
  }

  private startFlushTimer(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
  }

  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const batch = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      if (this.config.apiEndpoint) {
        // In production, would send to API
        // await fetch(this.config.apiEndpoint, { method: 'POST', body: JSON.stringify(batch) });
      }
      this.emit('flush', { count: batch.length, events: batch });
    } catch (error) {
      // Re-add failed events to buffer
      this.eventBuffer.unshift(...batch);
      this.emit('flush_error', error);
    }
  }

  // ==================== Export & Statistics ====================

  getStatistics(projectId: string): {
    totalEvents: number;
    totalSessions: number;
    totalUsers: number;
    eventsByType: Record<string, number>;
    topEvents: { name: string; count: number }[];
  } {
    const events = this.eventStore.get(projectId) || [];
    const sessions = new Set<string>();
    const users = new Set<string>();
    const eventsByType: Record<string, number> = {};
    const eventCounts = new Map<string, number>();

    for (const event of events) {
      sessions.add(event.session.sessionId);
      users.add(event.user.userId || event.user.anonymousId);
      
      const type = event.event.type;
      eventsByType[type] = (eventsByType[type] || 0) + 1;

      const name = type === 'custom' 
        ? (event.event as CustomEvent).name 
        : type;
      eventCounts.set(name, (eventCounts.get(name) || 0) + 1);
    }

    const topEvents = Array.from(eventCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvents: events.length,
      totalSessions: sessions.size,
      totalUsers: users.size,
      eventsByType,
      topEvents,
    };
  }

  exportEvents(projectId: string, format: 'json' | 'csv' = 'json'): string {
    const events = this.eventStore.get(projectId) || [];

    if (format === 'csv') {
      const headers = ['id', 'type', 'name', 'userId', 'sessionId', 'timestamp', 'properties'];
      const rows = events.map(e => {
        const name = e.event.type === 'custom' ? (e.event as CustomEvent).name : e.event.type;
        return [
          e.id,
          e.event.type,
          name,
          e.user.userId || e.user.anonymousId,
          e.session.sessionId,
          e.context.timestamp.toISOString(),
          JSON.stringify(e.event),
        ].join(',');
      });
      return [headers.join(','), ...rows].join('\n');
    }

    return JSON.stringify(events, null, 2);
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    this.removeAllListeners();
  }
}

// ==================== Singleton & Factory ====================

let instance: UserEventTrackingService | null = null;

export function getUserEventTracking(config?: Partial<TrackingConfig>): UserEventTrackingService {
  if (!instance) {
    instance = new UserEventTrackingService(config);
  } else if (config) {
    instance.configure(config);
  }
  return instance;
}

export function createUserEventTracking(config: Partial<TrackingConfig>): UserEventTrackingService {
  return new UserEventTrackingService(config);
}

export { UserEventTrackingService };
