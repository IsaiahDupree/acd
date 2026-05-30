/**
 * Approval Gates Service
 * =======================
 * 
 * Manages human-in-the-loop checkpoints for agent harness operations.
 * Provides strategic intervention points for quick validation before auto-continue.
 * 
 * Gate Types:
 * - pre_feature: Before starting a new feature
 * - post_feature: After completing a feature (before marking as done)
 * - error_recovery: When an error occurs and needs human decision
 * - milestone: After X features completed
 * - test_failure: When tests fail
 * - destructive_action: Before file deletions, major refactors, etc.
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';

export type ApprovalGateType = 
  | 'pre_feature'
  | 'post_feature'
  | 'error_recovery'
  | 'milestone'
  | 'test_failure'
  | 'destructive_action'
  | 'session_handoff'
  | 'custom';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout' | 'auto_approved';

export interface ApprovalGate {
  id: string;
  projectId: string;
  type: ApprovalGateType;
  status: ApprovalStatus;
  title: string;
  description: string;
  context: {
    featureId?: string;
    featureTitle?: string;
    sessionNumber?: number;
    errorMessage?: string;
    filesAffected?: string[];
    testResults?: { passed: number; failed: number; };
    [key: string]: any;
  };
  options: ApprovalOption[];
  timeoutMs: number;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
}

export interface ApprovalOption {
  id: string;
  label: string;
  description?: string;
  action: 'approve' | 'reject' | 'retry' | 'skip' | 'custom';
  isDefault?: boolean;
  style?: 'primary' | 'success' | 'danger' | 'warning' | 'secondary';
}

export interface ApprovalGateConfig {
  enabled: boolean;
  gates: {
    pre_feature: boolean;
    post_feature: boolean;
    error_recovery: boolean;
    milestone: boolean;
    test_failure: boolean;
    destructive_action: boolean;
    session_handoff: boolean;
  };
  milestoneInterval: number; // Request approval every N features
  autoApproveTimeoutMs: number; // Auto-approve after timeout (0 = never)
  notificationChannels: ('browser' | 'email' | 'slack' | 'webhook')[];
}

const DEFAULT_CONFIG: ApprovalGateConfig = {
  enabled: true,
  gates: {
    pre_feature: false,
    post_feature: false,
    error_recovery: true,
    milestone: true,
    test_failure: true,
    destructive_action: true,
    session_handoff: false,
  },
  milestoneInterval: 10,
  autoApproveTimeoutMs: 0,
  notificationChannels: ['browser'],
};

class ApprovalGatesService extends EventEmitter {
  private redis: Redis;
  private gates: Map<string, ApprovalGate> = new Map();
  private configs: Map<string, ApprovalGateConfig> = new Map();
  private pendingResolvers: Map<string, { resolve: Function; reject: Function; timeout?: NodeJS.Timeout }> = new Map();

  constructor() {
    super();
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.setupRedisSubscriptions();
  }

  private setupRedisSubscriptions() {
    const subscriber = this.redis.duplicate();
    subscriber.subscribe('approval:response');
    
    subscriber.on('message', (channel, message) => {
      if (channel === 'approval:response') {
        const { gateId, status, resolvedBy, resolution } = JSON.parse(message);
        this.handleResolution(gateId, status, resolvedBy, resolution);
      }
    });
  }

  /**
   * Get or set configuration for a project
   */
  getConfig(projectId: string): ApprovalGateConfig {
    return this.configs.get(projectId) || { ...DEFAULT_CONFIG };
  }

  setConfig(projectId: string, config: Partial<ApprovalGateConfig>): ApprovalGateConfig {
    const current = this.getConfig(projectId);
    const updated = { ...current, ...config, gates: { ...current.gates, ...config.gates } };
    this.configs.set(projectId, updated);
    return updated;
  }

  /**
   * Check if a gate type is enabled for a project
   */
  isGateEnabled(projectId: string, gateType: ApprovalGateType): boolean {
    const config = this.getConfig(projectId);
    if (!config.enabled) return false;
    return config.gates[gateType as keyof typeof config.gates] ?? false;
  }

  /**
   * Request approval - creates a gate and waits for resolution
   */
  async requestApproval(
    projectId: string,
    type: ApprovalGateType,
    details: {
      title: string;
      description: string;
      context?: ApprovalGate['context'];
      options?: ApprovalOption[];
      timeoutMs?: number;
    }
  ): Promise<{ approved: boolean; resolution?: string }> {
    const config = this.getConfig(projectId);
    
    // Check if this gate type is enabled
    if (!this.isGateEnabled(projectId, type)) {
      return { approved: true, resolution: 'gate_disabled' };
    }

    const gateId = `gate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const defaultOptions: ApprovalOption[] = [
      { id: 'approve', label: 'Approve', action: 'approve', isDefault: true, style: 'success' },
      { id: 'reject', label: 'Reject', action: 'reject', style: 'danger' },
    ];

    const gate: ApprovalGate = {
      id: gateId,
      projectId,
      type,
      status: 'pending',
      title: details.title,
      description: details.description,
      context: details.context || {},
      options: details.options || defaultOptions,
      timeoutMs: details.timeoutMs || config.autoApproveTimeoutMs || 300000, // 5 min default
      createdAt: new Date(),
    };

    this.gates.set(gateId, gate);

    // Publish gate request
    await this.redis.publish('agent_events', JSON.stringify({
      event: 'approval:requested',
      data: gate,
      timestamp: new Date().toISOString(),
    }));

    this.emit('approval:requested', gate);

    // Send notifications
    this.sendNotifications(gate);

    // Wait for resolution
    return new Promise((resolve, reject) => {
      const resolver = { resolve, reject, timeout: undefined as NodeJS.Timeout | undefined };
      
      // Set up timeout if configured
      if (config.autoApproveTimeoutMs > 0) {
        resolver.timeout = setTimeout(() => {
          this.handleResolution(gateId, 'timeout', 'system', 'auto_approved_timeout');
        }, config.autoApproveTimeoutMs);
      }
      
      this.pendingResolvers.set(gateId, resolver);
    });
  }

  /**
   * Resolve an approval gate
   */
  async resolveGate(
    gateId: string,
    status: 'approved' | 'rejected',
    resolvedBy: string,
    resolution?: string
  ): Promise<ApprovalGate | null> {
    const gate = this.gates.get(gateId);
    if (!gate || gate.status !== 'pending') {
      return null;
    }

    // Publish to Redis for distributed systems
    await this.redis.publish('approval:response', JSON.stringify({
      gateId,
      status,
      resolvedBy,
      resolution,
    }));

    return this.handleResolution(gateId, status, resolvedBy, resolution);
  }

  /**
   * Handle resolution (from local or Redis)
   */
  private handleResolution(
    gateId: string,
    status: ApprovalStatus,
    resolvedBy: string,
    resolution?: string
  ): ApprovalGate | null {
    const gate = this.gates.get(gateId);
    if (!gate) return null;

    gate.status = status;
    gate.resolvedAt = new Date();
    gate.resolvedBy = resolvedBy;
    gate.resolution = resolution;

    // Clear timeout if exists
    const resolver = this.pendingResolvers.get(gateId);
    if (resolver) {
      if (resolver.timeout) {
        clearTimeout(resolver.timeout);
      }
      
      const approved = status === 'approved' || status === 'auto_approved' || status === 'timeout';
      resolver.resolve({ approved, resolution });
      this.pendingResolvers.delete(gateId);
    }

    // Emit event
    this.emit('approval:resolved', gate);

    // Publish to Redis
    this.redis.publish('agent_events', JSON.stringify({
      event: 'approval:resolved',
      data: gate,
      timestamp: new Date().toISOString(),
    }));

    return gate;
  }

  /**
   * Send notifications for approval request
   */
  private async sendNotifications(gate: ApprovalGate) {
    const config = this.getConfig(gate.projectId);
    
    for (const channel of config.notificationChannels) {
      switch (channel) {
        case 'browser':
          // Browser notifications handled via Socket.IO on client
          break;
        case 'webhook':
          // TODO: Implement webhook notifications
          break;
        case 'slack':
          // TODO: Implement Slack notifications
          break;
        case 'email':
          // TODO: Implement email notifications
          break;
      }
    }
  }

  /**
   * Get all pending gates for a project
   */
  getPendingGates(projectId: string): ApprovalGate[] {
    return Array.from(this.gates.values())
      .filter(g => g.projectId === projectId && g.status === 'pending')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get all gates for a project
   */
  getAllGates(projectId: string, limit = 50): ApprovalGate[] {
    return Array.from(this.gates.values())
      .filter(g => g.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get a specific gate
   */
  getGate(gateId: string): ApprovalGate | undefined {
    return this.gates.get(gateId);
  }

  /**
   * Pre-built gate templates
   */
  templates = {
    preFeature: (projectId: string, featureId: string, featureTitle: string) => ({
      projectId,
      type: 'pre_feature' as ApprovalGateType,
      title: `Start Feature: ${featureTitle}`,
      description: `The agent is about to start working on feature "${featureTitle}". Approve to continue.`,
      context: { featureId, featureTitle },
      options: [
        { id: 'approve', label: 'Start Feature', action: 'approve' as const, style: 'success' as const },
        { id: 'skip', label: 'Skip Feature', action: 'skip' as const, style: 'warning' as const },
        { id: 'reject', label: 'Stop Harness', action: 'reject' as const, style: 'danger' as const },
      ],
    }),

    postFeature: (projectId: string, featureId: string, featureTitle: string, testsPassed: boolean) => ({
      projectId,
      type: 'post_feature' as ApprovalGateType,
      title: `Review: ${featureTitle}`,
      description: `Feature "${featureTitle}" has been implemented. Tests ${testsPassed ? 'passed' : 'failed'}. Review and approve to mark as complete.`,
      context: { featureId, featureTitle, testsPassed },
      options: [
        { id: 'approve', label: 'Mark Complete', action: 'approve' as const, style: 'success' as const },
        { id: 'retry', label: 'Retry Implementation', action: 'retry' as const, style: 'warning' as const },
        { id: 'reject', label: 'Reject & Stop', action: 'reject' as const, style: 'danger' as const },
      ],
    }),

    errorRecovery: (projectId: string, errorMessage: string, sessionNumber: number) => ({
      projectId,
      type: 'error_recovery' as ApprovalGateType,
      title: 'Error Recovery Required',
      description: `An error occurred in session ${sessionNumber}: "${errorMessage}". How should we proceed?`,
      context: { errorMessage, sessionNumber },
      options: [
        { id: 'retry', label: 'Retry', action: 'retry' as const, style: 'primary' as const },
        { id: 'skip', label: 'Skip & Continue', action: 'skip' as const, style: 'warning' as const },
        { id: 'reject', label: 'Stop Harness', action: 'reject' as const, style: 'danger' as const },
      ],
    }),

    milestone: (projectId: string, completedCount: number, totalCount: number) => ({
      projectId,
      type: 'milestone' as ApprovalGateType,
      title: `Milestone: ${completedCount} Features Complete`,
      description: `The agent has completed ${completedCount}/${totalCount} features. Review progress and approve to continue.`,
      context: { completedCount, totalCount, percentComplete: Math.round((completedCount / totalCount) * 100) },
      options: [
        { id: 'approve', label: 'Continue', action: 'approve' as const, style: 'success' as const },
        { id: 'reject', label: 'Pause Harness', action: 'reject' as const, style: 'warning' as const },
      ],
    }),

    testFailure: (projectId: string, featureTitle: string, testResults: { passed: number; failed: number }) => ({
      projectId,
      type: 'test_failure' as ApprovalGateType,
      title: `Tests Failed: ${featureTitle}`,
      description: `Tests failed for "${featureTitle}": ${testResults.passed} passed, ${testResults.failed} failed.`,
      context: { featureTitle, testResults },
      options: [
        { id: 'retry', label: 'Retry Tests', action: 'retry' as const, style: 'primary' as const },
        { id: 'skip', label: 'Skip Tests & Continue', action: 'skip' as const, style: 'warning' as const },
        { id: 'approve', label: 'Accept & Continue', action: 'approve' as const, style: 'secondary' as const },
        { id: 'reject', label: 'Stop Harness', action: 'reject' as const, style: 'danger' as const },
      ],
    }),

    destructiveAction: (projectId: string, action: string, filesAffected: string[]) => ({
      projectId,
      type: 'destructive_action' as ApprovalGateType,
      title: `Destructive Action: ${action}`,
      description: `The agent wants to perform a destructive action affecting ${filesAffected.length} files. Review carefully.`,
      context: { action, filesAffected },
      options: [
        { id: 'approve', label: 'Allow Action', action: 'approve' as const, style: 'danger' as const },
        { id: 'reject', label: 'Block Action', action: 'reject' as const, style: 'secondary' as const },
      ],
    }),
  };
}

// Singleton instance
let instance: ApprovalGatesService | null = null;

export function getApprovalGates(): ApprovalGatesService {
  if (!instance) {
    instance = new ApprovalGatesService();
  }
  return instance;
}

export { ApprovalGatesService };
