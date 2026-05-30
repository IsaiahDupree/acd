/**
 * Webhook Notifications Service
 * =============================
 * 
 * Sends notifications to external services via webhooks.
 * Supports Slack, Discord, custom webhooks, and email (via services like SendGrid).
 */

import { EventEmitter } from 'events';

export type WebhookType = 'slack' | 'discord' | 'custom' | 'email';

export interface WebhookConfig {
  id: string;
  projectId: string;
  type: WebhookType;
  name: string;
  url: string;
  enabled: boolean;
  events: WebhookEvent[];
  headers?: Record<string, string>;
  secret?: string;
  createdAt: Date;
}

export type WebhookEvent = 
  | 'harness:started'
  | 'harness:stopped'
  | 'harness:error'
  | 'feature:completed'
  | 'feature:failed'
  | 'approval:requested'
  | 'approval:resolved'
  | 'test:passed'
  | 'test:failed'
  | 'milestone:reached'
  | 'session:started'
  | 'session:ended';

export interface WebhookPayload {
  event: WebhookEvent;
  projectId: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: WebhookPayload;
  status: 'pending' | 'success' | 'failed';
  statusCode?: number;
  response?: string;
  error?: string;
  attempts: number;
  createdAt: Date;
  deliveredAt?: Date;
}

class WebhookNotificationService extends EventEmitter {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private deliveries: Map<string, WebhookDelivery[]> = new Map();
  private maxRetries = 3;
  private retryDelayMs = 5000;

  constructor() {
    super();
  }

  /**
   * Register a webhook
   */
  registerWebhook(config: Omit<WebhookConfig, 'id' | 'createdAt'>): WebhookConfig {
    const id = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const webhook: WebhookConfig = {
      ...config,
      id,
      createdAt: new Date(),
    };
    
    this.webhooks.set(id, webhook);
    this.emit('webhook:registered', webhook);
    
    return webhook;
  }

  /**
   * Update a webhook
   */
  updateWebhook(id: string, updates: Partial<Omit<WebhookConfig, 'id' | 'createdAt'>>): WebhookConfig | null {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;
    
    Object.assign(webhook, updates);
    this.emit('webhook:updated', webhook);
    
    return webhook;
  }

  /**
   * Delete a webhook
   */
  deleteWebhook(id: string): boolean {
    const deleted = this.webhooks.delete(id);
    if (deleted) {
      this.emit('webhook:deleted', { id });
    }
    return deleted;
  }

  /**
   * Get webhooks for a project
   */
  getWebhooks(projectId: string): WebhookConfig[] {
    return Array.from(this.webhooks.values())
      .filter(w => w.projectId === projectId);
  }

  /**
   * Get a specific webhook
   */
  getWebhook(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  /**
   * Send notification to all relevant webhooks
   */
  async notify(projectId: string, event: WebhookEvent, data: Record<string, any>): Promise<WebhookDelivery[]> {
    const webhooks = this.getWebhooks(projectId)
      .filter(w => w.enabled && w.events.includes(event));
    
    const deliveries: WebhookDelivery[] = [];
    
    for (const webhook of webhooks) {
      const delivery = await this.sendWebhook(webhook, event, data);
      deliveries.push(delivery);
    }
    
    return deliveries;
  }

  /**
   * Send to a specific webhook
   */
  private async sendWebhook(
    webhook: WebhookConfig,
    event: WebhookEvent,
    data: Record<string, any>
  ): Promise<WebhookDelivery> {
    const deliveryId = `del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const payload: WebhookPayload = {
      event,
      projectId: webhook.projectId,
      timestamp: new Date().toISOString(),
      data,
    };
    
    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhookId: webhook.id,
      event,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    };
    
    // Store delivery
    const projectDeliveries = this.deliveries.get(webhook.projectId) || [];
    projectDeliveries.push(delivery);
    this.deliveries.set(webhook.projectId, projectDeliveries);
    
    // Attempt delivery
    await this.attemptDelivery(webhook, delivery);
    
    return delivery;
  }

  /**
   * Attempt to deliver a webhook
   */
  private async attemptDelivery(webhook: WebhookConfig, delivery: WebhookDelivery): Promise<void> {
    delivery.attempts++;
    
    try {
      const body = this.formatPayload(webhook.type, delivery.payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AgentHarness-Webhook/1.0',
        ...webhook.headers,
      };
      
      // Add signature if secret is configured
      if (webhook.secret) {
        const signature = this.generateSignature(JSON.stringify(body), webhook.secret);
        headers['X-Webhook-Signature'] = signature;
      }
      
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      
      delivery.statusCode = response.status;
      
      if (response.ok) {
        delivery.status = 'success';
        delivery.deliveredAt = new Date();
        delivery.response = await response.text();
        this.emit('webhook:delivered', delivery);
      } else {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (error: any) {
      delivery.error = error.message;
      
      if (delivery.attempts < this.maxRetries) {
        // Schedule retry
        setTimeout(() => this.attemptDelivery(webhook, delivery), this.retryDelayMs * delivery.attempts);
      } else {
        delivery.status = 'failed';
        this.emit('webhook:failed', delivery);
      }
    }
  }

  /**
   * Format payload based on webhook type
   */
  private formatPayload(type: WebhookType, payload: WebhookPayload): object {
    switch (type) {
      case 'slack':
        return this.formatSlackPayload(payload);
      case 'discord':
        return this.formatDiscordPayload(payload);
      default:
        return payload;
    }
  }

  /**
   * Format for Slack incoming webhook
   */
  private formatSlackPayload(payload: WebhookPayload): object {
    const emoji = this.getEventEmoji(payload.event);
    const color = this.getEventColor(payload.event);
    
    return {
      attachments: [{
        color,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${emoji} ${this.formatEventTitle(payload.event)}`,
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Project:*\n${payload.projectId}`,
              },
              {
                type: 'mrkdwn',
                text: `*Time:*\n${new Date(payload.timestamp).toLocaleString()}`,
              },
            ],
          },
          ...(payload.data.message ? [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: payload.data.message,
            },
          }] : []),
          ...(payload.data.featureTitle ? [{
            type: 'context',
            elements: [{
              type: 'mrkdwn',
              text: `Feature: *${payload.data.featureTitle}*`,
            }],
          }] : []),
        ],
      }],
    };
  }

  /**
   * Format for Discord webhook
   */
  private formatDiscordPayload(payload: WebhookPayload): object {
    const emoji = this.getEventEmoji(payload.event);
    const color = parseInt(this.getEventColor(payload.event).replace('#', ''), 16);
    
    return {
      embeds: [{
        title: `${emoji} ${this.formatEventTitle(payload.event)}`,
        color,
        fields: [
          { name: 'Project', value: payload.projectId, inline: true },
          { name: 'Time', value: new Date(payload.timestamp).toLocaleString(), inline: true },
          ...(payload.data.message ? [{ name: 'Details', value: payload.data.message }] : []),
          ...(payload.data.featureTitle ? [{ name: 'Feature', value: payload.data.featureTitle }] : []),
        ],
        timestamp: payload.timestamp,
      }],
    };
  }

  /**
   * Get emoji for event type
   */
  private getEventEmoji(event: WebhookEvent): string {
    const emojis: Record<WebhookEvent, string> = {
      'harness:started': '🚀',
      'harness:stopped': '⏹️',
      'harness:error': '❌',
      'feature:completed': '✅',
      'feature:failed': '❌',
      'approval:requested': '⏳',
      'approval:resolved': '✔️',
      'test:passed': '🧪',
      'test:failed': '🔴',
      'milestone:reached': '🏁',
      'session:started': '▶️',
      'session:ended': '⏸️',
    };
    return emojis[event] || '📢';
  }

  /**
   * Get color for event type
   */
  private getEventColor(event: WebhookEvent): string {
    if (event.includes('error') || event.includes('failed')) return '#ef4444';
    if (event.includes('completed') || event.includes('passed')) return '#10b981';
    if (event.includes('started')) return '#6366f1';
    if (event.includes('approval')) return '#f59e0b';
    return '#6b7280';
  }

  /**
   * Format event title
   */
  private formatEventTitle(event: WebhookEvent): string {
    return event
      .split(':')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  /**
   * Generate HMAC signature
   */
  private generateSignature(payload: string, secret: string): string {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Get recent deliveries for a project
   */
  getDeliveries(projectId: string, limit = 50): WebhookDelivery[] {
    const deliveries = this.deliveries.get(projectId) || [];
    return deliveries.slice(-limit);
  }

  /**
   * Test a webhook
   */
  async testWebhook(id: string): Promise<WebhookDelivery | null> {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;
    
    return this.sendWebhook(webhook, 'harness:started', {
      message: 'This is a test notification from Agent Harness',
      test: true,
    });
  }

  /**
   * Pre-configured webhook templates
   */
  templates = {
    slack: (projectId: string, webhookUrl: string, name = 'Slack Notifications'): Omit<WebhookConfig, 'id' | 'createdAt'> => ({
      projectId,
      type: 'slack',
      name,
      url: webhookUrl,
      enabled: true,
      events: [
        'harness:started',
        'harness:stopped',
        'harness:error',
        'feature:completed',
        'approval:requested',
        'milestone:reached',
      ],
    }),

    discord: (projectId: string, webhookUrl: string, name = 'Discord Notifications'): Omit<WebhookConfig, 'id' | 'createdAt'> => ({
      projectId,
      type: 'discord',
      name,
      url: webhookUrl,
      enabled: true,
      events: [
        'harness:started',
        'harness:stopped',
        'harness:error',
        'feature:completed',
        'milestone:reached',
      ],
    }),

    custom: (projectId: string, webhookUrl: string, events: WebhookEvent[], name = 'Custom Webhook'): Omit<WebhookConfig, 'id' | 'createdAt'> => ({
      projectId,
      type: 'custom',
      name,
      url: webhookUrl,
      enabled: true,
      events,
    }),
  };
}

// Singleton
let instance: WebhookNotificationService | null = null;

export function getWebhookNotifications(): WebhookNotificationService {
  if (!instance) {
    instance = new WebhookNotificationService();
  }
  return instance;
}

export { WebhookNotificationService };
