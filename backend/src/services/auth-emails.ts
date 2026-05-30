/**
 * Authentication Email Service
 * ============================
 *
 * Handles authentication-related emails:
 * - PCT-WC-117: Welcome emails on sign-up
 * - PCT-WC-118: Password reset emails
 * - PCT-WC-119: Email verification flow
 *
 * Features:
 * - Welcome email with onboarding links
 * - Password reset with secure tokens
 * - Email verification with resend capability
 * - Token generation and validation
 */

import { getEmailService, EmailService } from './email-service';
import crypto from 'crypto';

export interface VerificationToken {
  token: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  used: boolean;
}

export interface PasswordResetToken {
  token: string;
  userId: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  used: boolean;
}

class AuthEmailService {
  private emailService: EmailService;
  private verificationTokens: Map<string, VerificationToken> = new Map();
  private resetTokens: Map<string, PasswordResetToken> = new Map();
  private baseUrl: string;
  private tokenExpiryMinutes = 60; // 1 hour for verification
  private resetTokenExpiryMinutes = 15; // 15 minutes for password reset

  constructor(emailService: EmailService, baseUrl: string) {
    this.emailService = emailService;
    this.baseUrl = baseUrl;
    this.initializeTemplates();
  }

  /**
   * Initialize email templates
   */
  private initializeTemplates(): void {
    // PCT-WC-117: Welcome email template
    this.emailService.registerTemplate({
      name: 'welcome',
      subject: 'Welcome to {{appName}}! 🎉',
      htmlTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 40px; border: 1px solid #e5e7eb; border-top: none; }
    .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to {{appName}}!</h1>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>

      <p>We're thrilled to have you on board! Your account has been successfully created.</p>

      <p>Here's what you can do next:</p>
      <ul>
        <li>Complete your profile</li>
        <li>Explore our features</li>
        <li>Connect with other users</li>
      </ul>

      <p style="text-align: center;">
        <a href="{{dashboardUrl}}" class="button">Get Started</a>
      </p>

      <p>If you have any questions, feel free to reach out to our support team.</p>

      <p>Best regards,<br>The {{appName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; 2026 {{appName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      textTemplate: `Welcome to {{appName}}!

Hi {{userName}},

We're thrilled to have you on board! Your account has been successfully created.

Here's what you can do next:
- Complete your profile
- Explore our features
- Connect with other users

Get started: {{dashboardUrl}}

If you have any questions, feel free to reach out to our support team.

Best regards,
The {{appName}} Team

---
© 2026 {{appName}}. All rights reserved.`,
      variables: ['appName', 'userName', 'dashboardUrl'],
    });

    // PCT-WC-118: Password reset email template
    this.emailService.registerTemplate({
      name: 'password-reset',
      subject: 'Reset Your Password - {{appName}}',
      htmlTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ef4444; color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 40px; border: 1px solid #e5e7eb; border-top: none; }
    .button { display: inline-block; padding: 12px 24px; background: #ef4444; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔒 Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>

      <p>We received a request to reset your password for your {{appName}} account.</p>

      <p style="text-align: center;">
        <a href="{{resetUrl}}" class="button">Reset Password</a>
      </p>

      <div class="alert">
        <strong>⚠️ Security Notice:</strong>
        <p style="margin: 8px 0 0 0;">This link will expire in {{expiryMinutes}} minutes. If you didn't request this reset, please ignore this email.</p>
      </div>

      <p>For security reasons, we cannot reset your password via email. You must click the link above to create a new password.</p>

      <p>Best regards,<br>The {{appName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; 2026 {{appName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      textTemplate: `Password Reset Request

Hi {{userName}},

We received a request to reset your password for your {{appName}} account.

Reset your password: {{resetUrl}}

⚠️ SECURITY NOTICE:
This link will expire in {{expiryMinutes}} minutes. If you didn't request this reset, please ignore this email.

For security reasons, we cannot reset your password via email. You must click the link above to create a new password.

Best regards,
The {{appName}} Team

---
© 2026 {{appName}}. All rights reserved.`,
      variables: ['appName', 'userName', 'resetUrl', 'expiryMinutes'],
    });

    // PCT-WC-119: Email verification template
    this.emailService.registerTemplate({
      name: 'email-verification',
      subject: 'Verify Your Email - {{appName}}',
      htmlTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10b981; color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 40px; border: 1px solid #e5e7eb; border-top: none; }
    .button { display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .code { background: #f3f4f6; padding: 16px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✉️ Verify Your Email</h1>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>

      <p>Thanks for signing up for {{appName}}! Please verify your email address to activate your account.</p>

      <p style="text-align: center;">
        <a href="{{verifyUrl}}" class="button">Verify Email Address</a>
      </p>

      <p>Or enter this verification code:</p>
      <div class="code">{{verificationCode}}</div>

      <p><small>This link will expire in {{expiryMinutes}} minutes.</small></p>

      <p>If you didn't create an account with {{appName}}, you can safely ignore this email.</p>

      <p>Best regards,<br>The {{appName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; 2026 {{appName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      textTemplate: `Verify Your Email

Hi {{userName}},

Thanks for signing up for {{appName}}! Please verify your email address to activate your account.

Verify your email: {{verifyUrl}}

Or enter this verification code: {{verificationCode}}

This link will expire in {{expiryMinutes}} minutes.

If you didn't create an account with {{appName}}, you can safely ignore this email.

Best regards,
The {{appName}} Team

---
© 2026 {{appName}}. All rights reserved.`,
      variables: ['appName', 'userName', 'verifyUrl', 'verificationCode', 'expiryMinutes'],
    });
  }

  /**
   * PCT-WC-117: Send welcome email
   */
  async sendWelcomeEmail(email: string, userName: string): Promise<void> {
    const template = this.emailService.getTemplate(
      Array.from(this.emailService.getAllTemplates()).find(t => t.name === 'welcome')?.id || ''
    );

    if (!template) {
      throw new Error('Welcome email template not found');
    }

    await this.emailService.send({
      to: email,
      subject: '', // Will be filled by template
      templateId: template.id,
      templateData: {
        appName: 'Programmatic Creative Testing',
        userName,
        dashboardUrl: `${this.baseUrl}/dashboard`,
      },
      tags: ['welcome', 'onboarding'],
    });
  }

  /**
   * PCT-WC-119: Generate verification token
   */
  generateVerificationToken(email: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const verificationToken: VerificationToken = {
      token,
      email,
      expiresAt: new Date(Date.now() + this.tokenExpiryMinutes * 60 * 1000),
      createdAt: new Date(),
      used: false,
    };

    this.verificationTokens.set(token, verificationToken);
    return token;
  }

  /**
   * PCT-WC-119: Send verification email
   */
  async sendVerificationEmail(email: string, userName: string): Promise<string> {
    const token = this.generateVerificationToken(email);
    const verifyUrl = `${this.baseUrl}/verify-email?token=${token}`;
    const verificationCode = token.substring(0, 6).toUpperCase();

    const template = this.emailService.getTemplate(
      Array.from(this.emailService.getAllTemplates()).find(t => t.name === 'email-verification')?.id || ''
    );

    if (!template) {
      throw new Error('Email verification template not found');
    }

    await this.emailService.send({
      to: email,
      subject: '', // Will be filled by template
      templateId: template.id,
      templateData: {
        appName: 'Programmatic Creative Testing',
        userName,
        verifyUrl,
        verificationCode,
        expiryMinutes: this.tokenExpiryMinutes.toString(),
      },
      tags: ['verification', 'authentication'],
    });

    return token;
  }

  /**
   * PCT-WC-119: Verify email token
   */
  verifyEmailToken(token: string): { valid: boolean; email?: string; error?: string } {
    const verificationToken = this.verificationTokens.get(token);

    if (!verificationToken) {
      return { valid: false, error: 'Invalid token' };
    }

    if (verificationToken.used) {
      return { valid: false, error: 'Token already used' };
    }

    if (new Date() > verificationToken.expiresAt) {
      return { valid: false, error: 'Token expired' };
    }

    // Mark as used
    verificationToken.used = true;

    return { valid: true, email: verificationToken.email };
  }

  /**
   * PCT-WC-119: Resend verification email
   */
  async resendVerificationEmail(email: string, userName: string): Promise<string> {
    // Invalidate old tokens for this email
    for (const [token, verification] of this.verificationTokens.entries()) {
      if (verification.email === email) {
        this.verificationTokens.delete(token);
      }
    }

    // Send new verification email
    return this.sendVerificationEmail(email, userName);
  }

  /**
   * PCT-WC-118: Generate password reset token
   */
  generatePasswordResetToken(userId: string, email: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const resetToken: PasswordResetToken = {
      token,
      userId,
      email,
      expiresAt: new Date(Date.now() + this.resetTokenExpiryMinutes * 60 * 1000),
      createdAt: new Date(),
      used: false,
    };

    this.resetTokens.set(token, resetToken);
    return token;
  }

  /**
   * PCT-WC-118: Send password reset email
   */
  async sendPasswordResetEmail(userId: string, email: string, userName: string): Promise<string> {
    const token = this.generatePasswordResetToken(userId, email);
    const resetUrl = `${this.baseUrl}/reset-password?token=${token}`;

    const template = this.emailService.getTemplate(
      Array.from(this.emailService.getAllTemplates()).find(t => t.name === 'password-reset')?.id || ''
    );

    if (!template) {
      throw new Error('Password reset email template not found');
    }

    await this.emailService.send({
      to: email,
      subject: '', // Will be filled by template
      templateId: template.id,
      templateData: {
        appName: 'Programmatic Creative Testing',
        userName,
        resetUrl,
        expiryMinutes: this.resetTokenExpiryMinutes.toString(),
      },
      tags: ['password-reset', 'authentication'],
    });

    return token;
  }

  /**
   * PCT-WC-118: Verify password reset token
   */
  verifyPasswordResetToken(token: string): { valid: boolean; userId?: string; email?: string; error?: string } {
    const resetToken = this.resetTokens.get(token);

    if (!resetToken) {
      return { valid: false, error: 'Invalid token' };
    }

    if (resetToken.used) {
      return { valid: false, error: 'Token already used' };
    }

    if (new Date() > resetToken.expiresAt) {
      return { valid: false, error: 'Token expired' };
    }

    // Mark as used
    resetToken.used = true;

    return { valid: true, userId: resetToken.userId, email: resetToken.email };
  }

  /**
   * Get verification token info (for testing/debugging)
   */
  getVerificationTokenInfo(token: string): VerificationToken | undefined {
    return this.verificationTokens.get(token);
  }

  /**
   * Get reset token info (for testing/debugging)
   */
  getResetTokenInfo(token: string): PasswordResetToken | undefined {
    return this.resetTokens.get(token);
  }

  /**
   * Clean up expired tokens (should be called periodically)
   */
  cleanupExpiredTokens(): void {
    const now = new Date();

    // Clean verification tokens
    for (const [token, verification] of this.verificationTokens.entries()) {
      if (now > verification.expiresAt) {
        this.verificationTokens.delete(token);
      }
    }

    // Clean reset tokens
    for (const [token, reset] of this.resetTokens.entries()) {
      if (now > reset.expiresAt) {
        this.resetTokens.delete(token);
      }
    }
  }
}

// Singleton instance
let instance: AuthEmailService | null = null;

export function getAuthEmailService(emailService?: EmailService, baseUrl?: string): AuthEmailService {
  if (!instance && emailService && baseUrl) {
    instance = new AuthEmailService(emailService, baseUrl);
  }
  if (!instance) {
    throw new Error('AuthEmailService not initialized. Call getAuthEmailService(emailService, baseUrl) first.');
  }
  return instance;
}

export function initializeAuthEmailService(emailService: EmailService, baseUrl: string): AuthEmailService {
  instance = new AuthEmailService(emailService, baseUrl);
  return instance;
}

export { AuthEmailService };
