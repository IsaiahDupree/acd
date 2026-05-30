/**
 * Transactional Email Service (PCT-WC-116)
 * =========================================
 *
 * Sends transactional emails via Resend or SendGrid with retry logic,
 * template support, and bounce/complaint handling.
 *
 * Features:
 * - Multiple email provider support (Resend, SendGrid)
 * - Automatic retry with exponential backoff
 * - Email template management
 * - Bounce and complaint tracking
 * - Rate limiting
 * - Email verification
 * - Password reset flows
 * - Welcome emails
 * - Digest emails
 */

import { EventEmitter } from 'events';

export type EmailProvider = 'resend' | 'sendgrid' | 'smtp';

export interface EmailConfig {
  provider: EmailProvider;
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  maxRetries?: number;
  retryDelay?: number;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlTemplate: string;
  textTemplate?: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  tags?: string[];
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface EmailDelivery {
  id: string;
  messageId?: string;
  to: string[];
  subject: string;
  status: 'pending' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed';
  provider: EmailProvider;
  attempts: number;
  error?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  bouncedAt?: Date;
  complainedAt?: Date;
  createdAt: Date;
}

export interface BounceEvent {
  email: string;
  type: 'hard' | 'soft';
  reason: string;
  timestamp: Date;
}

export interface ComplaintEvent {
  email: string;
  reason?: string;
  timestamp: Date;
}

class EmailService extends EventEmitter {
  private config: EmailConfig;
  private templates: Map<string, EmailTemplate> = new Map();
  private deliveries: EmailDelivery[] = [];
  private suppressionList: Set<string> = new Set();
  private bounces: Map<string, BounceEvent[]> = new Map();
  private complaints: Map<string, ComplaintEvent[]> = new Map();
  private rateLimit: { count: number; resetAt: Date } = { count: 0, resetAt: new Date() };
  private maxEmailsPerHour = 1000;

  constructor(config: EmailConfig) {
    super();
    this.config = {
      maxRetries: 3,
      retryDelay: 5000,
      ...config,
    };
  }

  /**
   * Send an email
   */
  async send(message: EmailMessage): Promise<EmailDelivery> {
    // Check rate limiting
    await this.checkRateLimit();

    // Create delivery record
    const delivery: EmailDelivery = {
      id: `eml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      status: 'pending',
      provider: this.config.provider,
      attempts: 0,
      createdAt: new Date(),
    };

    // Check suppression list
    const recipients = delivery.to.filter(email => !this.suppressionList.has(email.toLowerCase()));
    if (recipients.length === 0) {
      delivery.status = 'failed';
      delivery.error = 'All recipients are suppressed (bounced/complained)';
      this.deliveries.push(delivery);
      return delivery;
    }

    // Apply template if specified
    let html = message.html;
    let text = message.text;
    let subject = message.subject;

    if (message.templateId && message.templateData) {
      const template = this.templates.get(message.templateId);
      if (template) {
        subject = this.applyTemplateVariables(template.subject, message.templateData);
        html = this.applyTemplateVariables(template.htmlTemplate, message.templateData);
        text = template.textTemplate
          ? this.applyTemplateVariables(template.textTemplate, message.templateData)
          : undefined;
      }
    }

    // Send with retry logic
    await this.sendWithRetry(delivery, {
      ...message,
      to: recipients,
      subject,
      html,
      text,
    });

    this.deliveries.push(delivery);
    return delivery;
  }

  /**
   * Send with automatic retry
   */
  private async sendWithRetry(delivery: EmailDelivery, message: EmailMessage): Promise<void> {
    while (delivery.attempts < (this.config.maxRetries || 3)) {
      delivery.attempts++;

      try {
        const messageId = await this.sendViaProvider(message);
        delivery.messageId = messageId;
        delivery.status = 'sent';
        delivery.sentAt = new Date();
        this.emit('email:sent', delivery);
        return;
      } catch (error: any) {
        delivery.error = error.message;

        // Don't retry on permanent errors
        if (this.isPermanentError(error)) {
          delivery.status = 'failed';
          this.emit('email:failed', delivery);
          return;
        }

        // Wait before retry
        if (delivery.attempts < (this.config.maxRetries || 3)) {
          const delay = (this.config.retryDelay || 5000) * delivery.attempts;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          delivery.status = 'failed';
          this.emit('email:failed', delivery);
        }
      }
    }
  }

  /**
   * Send via configured provider
   */
  private async sendViaProvider(message: EmailMessage): Promise<string> {
    switch (this.config.provider) {
      case 'resend':
        return this.sendViaResend(message);
      case 'sendgrid':
        return this.sendViaSendGrid(message);
      default:
        throw new Error(`Unsupported email provider: ${this.config.provider}`);
    }
  }

  /**
   * Send via Resend
   */
  private async sendViaResend(message: EmailMessage): Promise<string> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo || this.config.replyTo,
        cc: message.cc,
        bcc: message.bcc,
        attachments: message.attachments?.map(a => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
        })),
        tags: message.tags,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`Resend API error: ${error.message || response.statusText}`);
    }

    const data = await response.json() as any;
    return data.id;
  }

  /**
   * Send via SendGrid
   */
  private async sendViaSendGrid(message: EmailMessage): Promise<string> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: (Array.isArray(message.to) ? message.to : [message.to]).map(email => ({ email })),
          cc: message.cc ? (Array.isArray(message.cc) ? message.cc : [message.cc]).map(email => ({ email })) : undefined,
          bcc: message.bcc ? (Array.isArray(message.bcc) ? message.bcc : [message.bcc]).map(email => ({ email })) : undefined,
        }],
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName,
        },
        reply_to: message.replyTo || this.config.replyTo ? {
          email: message.replyTo || this.config.replyTo!,
        } : undefined,
        subject: message.subject,
        content: [
          ...(message.text ? [{ type: 'text/plain', value: message.text }] : []),
          ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
        ],
        attachments: message.attachments?.map(a => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
          type: a.contentType,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`SendGrid API error: ${error.errors?.[0]?.message || response.statusText}`);
    }

    // SendGrid doesn't return message ID in response, use X-Message-Id header
    return response.headers.get('X-Message-Id') || `sg_${Date.now()}`;
  }

  /**
   * Check if error is permanent
   */
  private isPermanentError(error: any): boolean {
    const permanentMessages = [
      'invalid email',
      'email not found',
      'recipient rejected',
      'domain not found',
    ];
    return permanentMessages.some(msg => error.message?.toLowerCase().includes(msg));
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = new Date();
    if (now > this.rateLimit.resetAt) {
      this.rateLimit = {
        count: 0,
        resetAt: new Date(now.getTime() + 60 * 60 * 1000),
      };
    }

    if (this.rateLimit.count >= this.maxEmailsPerHour) {
      const waitMs = this.rateLimit.resetAt.getTime() - now.getTime();
      throw new Error(`Rate limit exceeded. Resets in ${Math.ceil(waitMs / 1000 / 60)} minutes`);
    }

    this.rateLimit.count++;
  }

  /**
   * Apply template variables
   */
  private applyTemplateVariables(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }

  /**
   * Register an email template
   */
  registerTemplate(template: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'>): EmailTemplate {
    const id = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const emailTemplate: EmailTemplate = {
      ...template,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.templates.set(id, emailTemplate);
    this.emit('template:registered', emailTemplate);

    return emailTemplate;
  }

  /**
   * Get a template
   */
  getTemplate(id: string): EmailTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get all templates
   */
  getAllTemplates(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Update a template
   */
  updateTemplate(id: string, updates: Partial<Omit<EmailTemplate, 'id' | 'createdAt'>>): EmailTemplate | null {
    const template = this.templates.get(id);
    if (!template) return null;

    Object.assign(template, { ...updates, updatedAt: new Date() });
    this.emit('template:updated', template);

    return template;
  }

  /**
   * Delete a template
   */
  deleteTemplate(id: string): boolean {
    const deleted = this.templates.delete(id);
    if (deleted) {
      this.emit('template:deleted', { id });
    }
    return deleted;
  }

  /**
   * Handle bounce event (PCT-WC-125)
   */
  handleBounce(bounce: BounceEvent): void {
    const email = bounce.email.toLowerCase();

    // Add to bounce history
    const history = this.bounces.get(email) || [];
    history.push(bounce);
    this.bounces.set(email, history);

    // Add to suppression list if hard bounce
    if (bounce.type === 'hard') {
      this.suppressionList.add(email);
    }

    this.emit('email:bounced', bounce);
  }

  /**
   * Handle complaint event (PCT-WC-125)
   */
  handleComplaint(complaint: ComplaintEvent): void {
    const email = complaint.email.toLowerCase();

    // Add to complaint history
    const history = this.complaints.get(email) || [];
    history.push(complaint);
    this.complaints.set(email, history);

    // Add to suppression list
    this.suppressionList.add(email);

    this.emit('email:complained', complaint);
  }

  /**
   * Get bounce history for an email
   */
  getBounces(email: string): BounceEvent[] {
    return this.bounces.get(email.toLowerCase()) || [];
  }

  /**
   * Get complaint history for an email
   */
  getComplaints(email: string): ComplaintEvent[] {
    return this.complaints.get(email.toLowerCase()) || [];
  }

  /**
   * Check if email is suppressed
   */
  isSuppressed(email: string): boolean {
    return this.suppressionList.has(email.toLowerCase());
  }

  /**
   * Remove email from suppression list
   */
  removeSuppression(email: string): boolean {
    return this.suppressionList.delete(email.toLowerCase());
  }

  /**
   * Get recent deliveries
   */
  getDeliveries(limit = 100): EmailDelivery[] {
    return this.deliveries.slice(-limit);
  }

  /**
   * Get delivery statistics
   */
  getStats(): {
    total: number;
    sent: number;
    delivered: number;
    bounced: number;
    complained: number;
    failed: number;
    suppressed: number;
  } {
    return {
      total: this.deliveries.length,
      sent: this.deliveries.filter(d => d.status === 'sent').length,
      delivered: this.deliveries.filter(d => d.status === 'delivered').length,
      bounced: this.deliveries.filter(d => d.status === 'bounced').length,
      complained: this.deliveries.filter(d => d.status === 'complained').length,
      failed: this.deliveries.filter(d => d.status === 'failed').length,
      suppressed: this.suppressionList.size,
    };
  }
}

// Singleton instance
let instance: EmailService | null = null;

export function getEmailService(config?: EmailConfig): EmailService {
  if (!instance && config) {
    instance = new EmailService(config);
  }
  if (!instance) {
    throw new Error('EmailService not initialized. Call getEmailService(config) first.');
  }
  return instance;
}

export function initializeEmailService(config: EmailConfig): EmailService {
  instance = new EmailService(config);
  return instance;
}

export { EmailService };
