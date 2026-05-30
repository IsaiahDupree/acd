/**
 * Branded Email Templates Service
 * =================================
 *
 * PCT-WC-122: Email templates with branding
 * PCT-WC-124: Digest summary emails
 *
 * Features:
 * - Consistent branded email layouts
 * - Responsive HTML templates
 * - Header and footer customization
 * - Daily/weekly digest summaries
 * - Template variables and customization
 */

import { getEmailService } from './email-service';
import { getNotificationService, InAppNotification } from './notification-service';

export interface BrandConfig {
  appName: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  footerLinks?: Array<{ text: string; url: string }>;
  companyName: string;
  companyAddress?: string;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    facebook?: string;
    github?: string;
  };
}

export class EmailTemplateBuilder {
  private brand: BrandConfig;

  constructor(brand: BrandConfig) {
    this.brand = brand;
  }

  /**
   * PCT-WC-122: Generate base HTML template with branding
   */
  private getBaseTemplate(content: string, preheaderText?: string): string {
    return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${this.brand.appName}</title>
  ${preheaderText ? `
  <style type="text/css">
    .preheader { display: none !important; visibility: hidden; mso-hide: all; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; }
  </style>
  ` : ''}
  <style type="text/css">
    /* Reset styles */
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }

    /* Email client specific styles */
    .ExternalClass { width: 100%; }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }

    /* Base styles */
    body, #bodyTable { height: 100% !important; margin: 0; padding: 0; width: 100% !important; }

    /* Typography */
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }
    h1, h2, h3, h4, h5, h6 { margin: 0; padding: 0; font-weight: 600; }

    /* Links */
    a { color: ${this.brand.primaryColor}; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Buttons */
    .button { background-color: ${this.brand.primaryColor}; border-radius: 6px; color: #ffffff; display: inline-block; font-size: 16px; font-weight: 600; line-height: 48px; text-align: center; text-decoration: none; -webkit-text-size-adjust: none; padding: 0 32px; mso-hide: all; }
    .button:hover { background-color: ${this.brand.accentColor}; text-decoration: none; }

    /* Responsive */
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .content { padding: 20px !important; }
      .button { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6;">
  ${preheaderText ? `<span class="preheader">${preheaderText}</span>` : ''}
  <table id="bodyTable" width="100%" bgcolor="#f3f4f6" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" valign="top" style="padding: 40px 20px;">
        <!-- Main container -->
        <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
          ${this.getHeader()}

          <!-- Content -->
          <tr>
            <td class="content" style="background-color: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
              ${content}
            </td>
          </tr>

          ${this.getFooter()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * PCT-WC-122: Generate email header with branding
   */
  private getHeader(): string {
    return `
    <tr>
      <td style="background: linear-gradient(135deg, ${this.brand.primaryColor} 0%, ${this.brand.accentColor} 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
        ${this.brand.logoUrl ? `
        <img src="${this.brand.logoUrl}" alt="${this.brand.appName}" style="max-width: 200px; height: auto;" />
        ` : `
        <h1 style="color: #ffffff; font-size: 28px; margin: 0;">${this.brand.appName}</h1>
        `}
      </td>
    </tr>`;
  }

  /**
   * PCT-WC-122: Generate email footer with branding
   */
  private getFooter(): string {
    const currentYear = new Date().getFullYear();
    const socialIcons = this.brand.socialLinks ? this.getSocialIcons() : '';

    return `
    <tr>
      <td style="background-color: #1f2937; padding: 30px; text-align: center; color: #9ca3af; font-size: 14px; border-radius: 0 0 8px 8px;">
        ${socialIcons}

        ${this.brand.footerLinks && this.brand.footerLinks.length > 0 ? `
        <p style="margin: 20px 0;">
          ${this.brand.footerLinks.map(link => `<a href="${link.url}" style="color: #d1d5db; margin: 0 10px;">${link.text}</a>`).join(' | ')}
        </p>
        ` : ''}

        <p style="margin: 10px 0;">
          &copy; ${currentYear} ${this.brand.companyName}. All rights reserved.
        </p>

        ${this.brand.companyAddress ? `
        <p style="margin: 10px 0; color: #6b7280;">
          ${this.brand.companyAddress}
        </p>
        ` : ''}

        <p style="margin: 10px 0; font-size: 12px;">
          You're receiving this email because you have an account with ${this.brand.appName}.
        </p>
      </td>
    </tr>`;
  }

  /**
   * Get social media icons
   */
  private getSocialIcons(): string {
    if (!this.brand.socialLinks) return '';

    const icons: string[] = [];

    if (this.brand.socialLinks.twitter) {
      icons.push(`<a href="${this.brand.socialLinks.twitter}" style="margin: 0 8px;"><img src="https://cdn-icons-png.flaticon.com/32/733/733579.png" alt="Twitter" width="24" height="24" /></a>`);
    }
    if (this.brand.socialLinks.linkedin) {
      icons.push(`<a href="${this.brand.socialLinks.linkedin}" style="margin: 0 8px;"><img src="https://cdn-icons-png.flaticon.com/32/733/733561.png" alt="LinkedIn" width="24" height="24" /></a>`);
    }
    if (this.brand.socialLinks.facebook) {
      icons.push(`<a href="${this.brand.socialLinks.facebook}" style="margin: 0 8px;"><img src="https://cdn-icons-png.flaticon.com/32/733/733547.png" alt="Facebook" width="24" height="24" /></a>`);
    }
    if (this.brand.socialLinks.github) {
      icons.push(`<a href="${this.brand.socialLinks.github}" style="margin: 0 8px;"><img src="https://cdn-icons-png.flaticon.com/32/733/733553.png" alt="GitHub" width="24" height="24" /></a>`);
    }

    return icons.length > 0 ? `<p style="margin: 0 0 20px 0;">${icons.join('')}</p>` : '';
  }

  /**
   * PCT-WC-122: Build a branded email
   */
  buildEmail(content: string, preheaderText?: string): string {
    return this.getBaseTemplate(content, preheaderText);
  }

  /**
   * PCT-WC-124: Build daily digest email
   */
  buildDailyDigest(notifications: InAppNotification[], userName: string): string {
    const content = `
      <h2 style="color: #111827; font-size: 24px; margin-bottom: 20px;">Daily Digest</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi ${userName},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Here's your daily summary of activity:</p>

      ${this.buildNotificationList(notifications)}

      <p style="text-align: center; margin: 30px 0;">
        <a href="{{dashboardUrl}}" class="button">View Dashboard</a>
      </p>

      <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
        <a href="{{preferencesUrl}}" style="color: #6b7280;">Update your notification preferences</a> to change the frequency of these digests.
      </p>`;

    return this.buildEmail(content, `You have ${notifications.length} new notifications`);
  }

  /**
   * PCT-WC-124: Build weekly digest email
   */
  buildWeeklyDigest(
    notifications: InAppNotification[],
    userName: string,
    stats: {
      featuresCompleted: number;
      testsRun: number;
      milestonesReached: number;
    }
  ): string {
    const content = `
      <h2 style="color: #111827; font-size: 24px; margin-bottom: 20px;">Weekly Summary</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi ${userName},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Here's what happened this week:</p>

      <!-- Stats -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
        <tr>
          <td style="padding: 20px; background-color: #f9fafb; border-radius: 6px; text-align: center; width: 33%;">
            <h3 style="color: ${this.brand.primaryColor}; font-size: 32px; margin: 0;">${stats.featuresCompleted}</h3>
            <p style="color: #6b7280; font-size: 14px; margin: 8px 0 0 0;">Features Completed</p>
          </td>
          <td style="width: 2%;"></td>
          <td style="padding: 20px; background-color: #f9fafb; border-radius: 6px; text-align: center; width: 33%;">
            <h3 style="color: ${this.brand.primaryColor}; font-size: 32px; margin: 0;">${stats.testsRun}</h3>
            <p style="color: #6b7280; font-size: 14px; margin: 8px 0 0 0;">Tests Run</p>
          </td>
          <td style="width: 2%;"></td>
          <td style="padding: 20px; background-color: #f9fafb; border-radius: 6px; text-align: center; width: 33%;">
            <h3 style="color: ${this.brand.primaryColor}; font-size: 32px; margin: 0;">${stats.milestonesReached}</h3>
            <p style="color: #6b7280; font-size: 14px; margin: 8px 0 0 0;">Milestones</p>
          </td>
        </tr>
      </table>

      <h3 style="color: #111827; font-size: 18px; margin: 30px 0 15px 0;">Recent Activity</h3>
      ${this.buildNotificationList(notifications.slice(0, 10))}

      <p style="text-align: center; margin: 30px 0;">
        <a href="{{dashboardUrl}}" class="button">View Dashboard</a>
      </p>

      <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
        <a href="{{preferencesUrl}}" style="color: #6b7280;">Update your notification preferences</a>
      </p>`;

    return this.buildEmail(content, `Your weekly summary: ${stats.featuresCompleted} features completed`);
  }

  /**
   * Build notification list HTML
   */
  private buildNotificationList(notifications: InAppNotification[]): string {
    if (notifications.length === 0) {
      return '<p style="color: #9ca3af; font-style: italic;">No new notifications</p>';
    }

    const items = notifications.map(notification => {
      const icon = this.getNotificationIcon(notification.type);
      return `
        <tr>
          <td style="padding: 15px; border-bottom: 1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="40" valign="top">${icon}</td>
                <td valign="top">
                  <h4 style="color: #111827; font-size: 16px; margin: 0 0 5px 0;">${notification.title}</h4>
                  <p style="color: #6b7280; font-size: 14px; margin: 0 0 5px 0;">${notification.message}</p>
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    ${this.formatDate(notification.createdAt)}
                    ${notification.url ? ` • <a href="${notification.url}" style="color: ${this.brand.primaryColor};">View details</a>` : ''}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }).join('');

    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #f9fafb; border-radius: 6px; overflow: hidden;">
        ${items}
      </table>`;
  }

  /**
   * Get notification icon emoji
   */
  private getNotificationIcon(type: string): string {
    const icons: Record<string, string> = {
      system: '⚙️',
      feature_update: '✨',
      approval_request: '🔔',
      approval_resolved: '✅',
      test_result: '🧪',
      milestone: '🏁',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
    };
    return icons[type] || '📢';
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

/**
 * PCT-WC-124: Digest Email Service
 */
export class DigestEmailService {
  private templateBuilder: EmailTemplateBuilder;
  private emailService = getEmailService();
  private notificationService = getNotificationService();

  constructor(brandConfig: BrandConfig) {
    this.templateBuilder = new EmailTemplateBuilder(brandConfig);
  }

  /**
   * Send daily digest to user
   */
  async sendDailyDigest(userId: string, email: string, userName: string): Promise<void> {
    // Get unread notifications from the last 24 hours
    const notifications = this.notificationService.getUserNotifications(userId, {
      unreadOnly: true,
      limit: 50,
    }).filter(n => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return n.createdAt > dayAgo;
    });

    if (notifications.length === 0) {
      // No notifications, skip sending digest
      return;
    }

    const htmlContent = this.templateBuilder.buildDailyDigest(notifications, userName);

    await this.emailService.send({
      to: email,
      subject: `Daily Digest: ${notifications.length} new notifications`,
      html: htmlContent,
      tags: ['digest', 'daily'],
    });
  }

  /**
   * Send weekly digest to user
   */
  async sendWeeklyDigest(
    userId: string,
    email: string,
    userName: string,
    stats: {
      featuresCompleted: number;
      testsRun: number;
      milestonesReached: number;
    }
  ): Promise<void> {
    // Get notifications from the last 7 days
    const notifications = this.notificationService.getUserNotifications(userId, {
      limit: 100,
    }).filter(n => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return n.createdAt > weekAgo;
    });

    const htmlContent = this.templateBuilder.buildWeeklyDigest(notifications, userName, stats);

    await this.emailService.send({
      to: email,
      subject: `Weekly Summary: ${stats.featuresCompleted} features completed this week`,
      html: htmlContent,
      tags: ['digest', 'weekly'],
    });
  }
}

// Default brand configuration
export const defaultBrandConfig: BrandConfig = {
  appName: 'Programmatic Creative Testing',
  primaryColor: '#667eea',
  accentColor: '#764ba2',
  companyName: 'PCT Platform',
  footerLinks: [
    { text: 'Dashboard', url: 'https://pct.example.com/dashboard' },
    { text: 'Help Center', url: 'https://pct.example.com/help' },
    { text: 'Privacy', url: 'https://pct.example.com/privacy' },
  ],
};

export function getEmailTemplateBuilder(brand?: BrandConfig): EmailTemplateBuilder {
  return new EmailTemplateBuilder(brand || defaultBrandConfig);
}

export function getDigestEmailService(brand?: BrandConfig): DigestEmailService {
  return new DigestEmailService(brand || defaultBrandConfig);
}
