/**
 * Encryption utilities for PII data at rest
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits auth tag
const SALT_LENGTH = 32; // 256 bits

interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
}

/**
 * Get encryption key from environment
 * In production, this should come from a secure key management service (AWS KMS, HashiCorp Vault, etc.)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required for PII encryption');
  }

  // Ensure key is 32 bytes (256 bits) for AES-256
  if (Buffer.from(key, 'hex').length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters) for AES-256');
  }

  return Buffer.from(key, 'hex');
}

/**
 * Derive a key from the master key using PBKDF2
 * This adds an additional layer of security and allows key rotation
 */
function deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
}

/**
 * Encrypt plaintext data
 * @param plaintext - The data to encrypt
 * @returns Encrypted data with IV, auth tag, and salt
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;

  try {
    const masterKey = getEncryptionKey();
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(masterKey, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    const encrypted: EncryptedData = {
      ciphertext,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      salt: salt.toString('hex'),
    };

    // Return as base64-encoded JSON for easy storage
    return Buffer.from(JSON.stringify(encrypted)).toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt ciphertext data
 * @param encryptedData - The encrypted data string
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) return encryptedData;

  try {
    // Decode from base64
    const decoded = Buffer.from(encryptedData, 'base64').toString('utf8');
    const data: EncryptedData = JSON.parse(decoded);

    const masterKey = getEncryptionKey();
    const salt = Buffer.from(data.salt, 'hex');
    const key = deriveKey(masterKey, salt);
    const iv = Buffer.from(data.iv, 'hex');
    const authTag = Buffer.from(data.authTag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(data.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data - data may be corrupted or key is incorrect');
  }
}

/**
 * Hash data for non-reversible storage (e.g., tokens, passwords)
 * Uses PBKDF2 for secure hashing
 */
export function hash(data: string, salt?: string): { hash: string; salt: string } {
  const saltBuffer = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(16);
  const hashBuffer = crypto.pbkdf2Sync(data, saltBuffer, 10000, 64, 'sha512');

  return {
    hash: hashBuffer.toString('hex'),
    salt: saltBuffer.toString('hex'),
  };
}

/**
 * Verify hashed data
 */
export function verifyHash(data: string, storedHash: string, salt: string): boolean {
  const { hash: computedHash } = hash(data, salt);
  return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash));
}

/**
 * Generate a secure encryption key
 * Use this to generate the ENCRYPTION_KEY for your .env file
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware-compatible encryption helpers
 */
export const encryptionHelpers = {
  /**
   * Encrypt PII fields in an object
   */
  encryptFields<T extends Record<string, any>>(
    obj: T,
    fields: (keyof T)[]
  ): T {
    const result = { ...obj };
    for (const field of fields) {
      if (result[field] && typeof result[field] === 'string') {
        result[field] = encrypt(result[field] as string) as T[keyof T];
      }
    }
    return result;
  },

  /**
   * Decrypt PII fields in an object
   */
  decryptFields<T extends Record<string, any>>(
    obj: T,
    fields: (keyof T)[]
  ): T {
    const result = { ...obj };
    for (const field of fields) {
      if (result[field] && typeof result[field] === 'string') {
        try {
          result[field] = decrypt(result[field] as string) as T[keyof T];
        } catch (error) {
          // If decryption fails, it might be unencrypted data - leave as is
          console.warn(`Failed to decrypt field ${String(field)}:`, error);
        }
      }
    }
    return result;
  },
};

/**
 * PII field configuration
 * Define which fields in each model need encryption
 */
export const PII_FIELDS = {
  User: ['email', 'name'] as const,
  Repo: ['accessTokenEncrypted'] as const,
  ApiToken: ['tokenHash'] as const,
  // Add more models as needed
} as const;

/**
 * Check if encryption is properly configured
 */
export function validateEncryptionSetup(): { valid: boolean; error?: string } {
  try {
    const key = process.env.ENCRYPTION_KEY;

    if (!key) {
      return {
        valid: false,
        error: 'ENCRYPTION_KEY not set in environment',
      };
    }

    const keyBuffer = Buffer.from(key, 'hex');
    if (keyBuffer.length !== 32) {
      return {
        valid: false,
        error: 'ENCRYPTION_KEY must be 32 bytes (64 hex characters)',
      };
    }

    // Test encryption/decryption
    const testData = 'test-encryption-' + Date.now();
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);

    if (testData !== decrypted) {
      return {
        valid: false,
        error: 'Encryption test failed - encrypted data does not match decrypted',
      };
    }

    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message,
    };
  }
}
