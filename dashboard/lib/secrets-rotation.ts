/**
 * Secrets Rotation System (CF-WC-115)
 *
 * Automated secrets rotation and management for API keys, tokens, and credentials.
 */

import { logger } from './logger';

export interface Secret {
  name: string;
  value: string;
  createdAt: Date;
  expiresAt?: Date;
  rotationInterval: number; // days
  lastRotated?: Date;
  type: 'api_key' | 'jwt_secret' | 'encryption_key' | 'database_password';
}

export interface RotationResult {
  success: boolean;
  oldValue?: string;
  newValue?: string;
  error?: string;
}

class SecretsManager {
  private secrets: Map<string, Secret> = new Map();
  private rotationCallbacks: Map<string, (newValue: string) => Promise<void>> =
    new Map();

  // Register a secret for rotation
  registerSecret(
    name: string,
    secret: Omit<Secret, 'name'>,
    onRotate?: (newValue: string) => Promise<void>
  ) {
    this.secrets.set(name, { name, ...secret });

    if (onRotate) {
      this.rotationCallbacks.set(name, onRotate);
    }

    logger.info('Secret registered', { name, type: secret.type });
  }

  // Check if a secret needs rotation
  needsRotation(name: string): boolean {
    const secret = this.secrets.get(name);
    if (!secret) return false;

    // Check expiration date
    if (secret.expiresAt && new Date() >= secret.expiresAt) {
      return true;
    }

    // Check rotation interval
    if (secret.lastRotated) {
      const daysSinceRotation =
        (Date.now() - secret.lastRotated.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceRotation >= secret.rotationInterval;
    }

    // Check age of secret
    const daysOld =
      (Date.now() - secret.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysOld >= secret.rotationInterval;
  }

  // Rotate a secret
  async rotateSecret(name: string): Promise<RotationResult> {
    const secret = this.secrets.get(name);
    if (!secret) {
      return {
        success: false,
        error: `Secret ${name} not found`,
      };
    }

    try {
      logger.info('Starting secret rotation', { name, type: secret.type });

      // Generate new secret based on type
      const newValue = this.generateSecret(secret.type);
      const oldValue = secret.value;

      // Call rotation callback if registered
      const callback = this.rotationCallbacks.get(name);
      if (callback) {
        await callback(newValue);
      }

      // Update secret
      secret.value = newValue;
      secret.lastRotated = new Date();
      this.secrets.set(name, secret);

      logger.info('Secret rotated successfully', { name, type: secret.type });

      return {
        success: true,
        oldValue,
        newValue,
      };
    } catch (error) {
      logger.error('Secret rotation failed', error as Error, {
        name,
        type: secret.type,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Generate a new secret value based on type
  private generateSecret(type: Secret['type']): string {
    switch (type) {
      case 'api_key':
        return this.generateApiKey();
      case 'jwt_secret':
        return this.generateJwtSecret();
      case 'encryption_key':
        return this.generateEncryptionKey();
      case 'database_password':
        return this.generateDatabasePassword();
      default:
        return this.generateRandomString(64);
    }
  }

  private generateApiKey(): string {
    const prefix = 'cf_';
    const randomPart = this.generateRandomString(40, 'base62');
    return `${prefix}${randomPart}`;
  }

  private generateJwtSecret(): string {
    return this.generateRandomString(64, 'base64');
  }

  private generateEncryptionKey(): string {
    return this.generateRandomString(32, 'hex');
  }

  private generateDatabasePassword(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    return this.generateRandomString(32, 'custom', chars);
  }

  private generateRandomString(
    length: number,
    encoding: 'hex' | 'base64' | 'base62' | 'custom' = 'hex',
    customChars?: string
  ): string {
    if (encoding === 'custom' && customChars) {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += customChars.charAt(
          Math.floor(Math.random() * customChars.length)
        );
      }
      return result;
    }

    const bytes = crypto.getRandomValues(new Uint8Array(length));

    switch (encoding) {
      case 'hex':
        return Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      case 'base64':
        return btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
      case 'base62':
        const base62Chars =
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from(bytes)
          .map((b) => base62Chars[b % 62])
          .join('');
      default:
        return Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
    }
  }

  // Check all secrets and rotate if needed
  async checkAndRotateAll(): Promise<Record<string, RotationResult>> {
    const results: Record<string, RotationResult> = {};

    for (const [name, secret] of this.secrets) {
      if (this.needsRotation(name)) {
        logger.info('Secret needs rotation', { name, type: secret.type });
        results[name] = await this.rotateSecret(name);
      }
    }

    return results;
  }

  // Get all secrets that need rotation
  getSecretsNeedingRotation(): Secret[] {
    const secrets: Secret[] = [];

    for (const [name] of this.secrets) {
      if (this.needsRotation(name)) {
        const secret = this.secrets.get(name);
        if (secret) {
          secrets.push(secret);
        }
      }
    }

    return secrets;
  }
}

// Singleton instance
export const secretsManager = new SecretsManager();

// Example registration of secrets
export function initializeSecrets() {
  // JWT Secret - rotate every 90 days
  secretsManager.registerSecret(
    'jwt_secret',
    {
      value: process.env.JWT_SECRET || '',
      createdAt: new Date(),
      rotationInterval: 90,
      type: 'jwt_secret',
    },
    async (newValue) => {
      // Update environment variable
      process.env.JWT_SECRET = newValue;
      logger.info('JWT secret updated in environment');
    }
  );

  // API Key - rotate every 30 days
  secretsManager.registerSecret(
    'api_secret',
    {
      value: process.env.API_SECRET_KEY || '',
      createdAt: new Date(),
      rotationInterval: 30,
      type: 'api_key',
    },
    async (newValue) => {
      process.env.API_SECRET_KEY = newValue;
      logger.info('API secret updated in environment');
    }
  );

  logger.info('Secrets rotation system initialized');
}

// Cron job for automatic rotation (run daily)
export async function rotationCronJob() {
  logger.info('Running secrets rotation check');
  const results = await secretsManager.checkAndRotateAll();

  const rotatedCount = Object.values(results).filter((r) => r.success).length;
  logger.info('Secrets rotation check completed', {
    rotated: rotatedCount,
    total: Object.keys(results).length,
  });

  return results;
}
