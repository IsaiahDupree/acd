/**
 * Tests for encryption utilities
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  encrypt,
  decrypt,
  hash,
  verifyHash,
  generateEncryptionKey,
  validateEncryptionSetup,
  encryptionHelpers,
} from '../utils/encryption';

describe('Encryption Utilities', () => {
  beforeAll(() => {
    // Set a test encryption key
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = generateEncryptionKey();
    }
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const plaintext = 'sensitive-user-email@example.com';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(encrypted).not.toBe(plaintext);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'test@example.com';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const result = encrypt('');
      expect(result).toBe('');
    });

    it('should handle unicode characters', () => {
      const plaintext = '你好世界 🔒 مرحبا';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error on tampered data', () => {
      const plaintext = 'test@example.com';
      const encrypted = encrypt(plaintext);

      // Tamper with the encrypted data
      const tampered = encrypted.slice(0, -5) + 'XXXXX';

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('hash/verifyHash', () => {
    it('should hash data securely', () => {
      const data = 'api-token-12345';
      const { hash: hash1, salt } = hash(data);

      expect(hash1).toBeTruthy();
      expect(salt).toBeTruthy();
      expect(hash1).not.toBe(data);
    });

    it('should verify correct hash', () => {
      const data = 'password123';
      const { hash: hashedData, salt } = hash(data);

      expect(verifyHash(data, hashedData, salt)).toBe(true);
    });

    it('should reject incorrect hash', () => {
      const data = 'password123';
      const { hash: hashedData, salt } = hash(data);

      expect(verifyHash('wrongpassword', hashedData, salt)).toBe(false);
    });

    it('should produce different hashes with different salts', () => {
      const data = 'same-data';
      const { hash: hash1 } = hash(data);
      const { hash: hash2 } = hash(data);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('encryptionHelpers', () => {
    it('should encrypt specified fields in object', () => {
      const obj = {
        id: '123',
        email: 'user@example.com',
        name: 'John Doe',
        role: 'admin',
      };

      const encrypted = encryptionHelpers.encryptFields(obj, ['email', 'name']);

      expect(encrypted.id).toBe('123');
      expect(encrypted.role).toBe('admin');
      expect(encrypted.email).not.toBe('user@example.com');
      expect(encrypted.name).not.toBe('John Doe');
    });

    it('should decrypt specified fields in object', () => {
      const obj = {
        id: '123',
        email: 'user@example.com',
        name: 'John Doe',
        role: 'admin',
      };

      const encrypted = encryptionHelpers.encryptFields(obj, ['email', 'name']);
      const decrypted = encryptionHelpers.decryptFields(encrypted, ['email', 'name']);

      expect(decrypted).toEqual(obj);
    });

    it('should handle null and undefined values', () => {
      const obj = {
        id: '123',
        email: null as any,
        name: undefined as any,
      };

      const encrypted = encryptionHelpers.encryptFields(obj, ['email', 'name']);

      expect(encrypted.email).toBeNull();
      expect(encrypted.name).toBeUndefined();
    });
  });

  describe('validateEncryptionSetup', () => {
    it('should validate correct encryption setup', () => {
      const result = validateEncryptionSetup();

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect missing encryption key', () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;

      const result = validateEncryptionSetup();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('ENCRYPTION_KEY');

      process.env.ENCRYPTION_KEY = originalKey;
    });

    it('should detect invalid key length', () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'tooshort';

      const result = validateEncryptionSetup();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('32 bytes');

      process.env.ENCRYPTION_KEY = originalKey;
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate valid encryption key', () => {
      const key = generateEncryptionKey();

      expect(key).toBeTruthy();
      expect(key.length).toBe(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]{64}$/i.test(key)).toBe(true);
    });

    it('should generate unique keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe('PII field encryption integration', () => {
    it('should encrypt and decrypt user data', () => {
      const userData = {
        id: 'user-123',
        email: 'john.doe@example.com',
        name: 'John Doe',
        role: 'admin',
      };

      const encrypted = encryptionHelpers.encryptFields(userData, ['email', 'name']);

      expect(encrypted.email).not.toBe(userData.email);
      expect(encrypted.name).not.toBe(userData.name);
      expect(encrypted.role).toBe(userData.role);

      const decrypted = encryptionHelpers.decryptFields(encrypted, ['email', 'name']);

      expect(decrypted).toEqual(userData);
    });

    it('should encrypt access tokens', () => {
      const tokenData = {
        id: 'token-123',
        accessTokenEncrypted: 'ghp_1234567890abcdef',
        repoUrl: 'https://github.com/user/repo',
      };

      const encrypted = encryptionHelpers.encryptFields(tokenData, ['accessTokenEncrypted']);

      expect(encrypted.accessTokenEncrypted).not.toBe(tokenData.accessTokenEncrypted);
      expect(encrypted.repoUrl).toBe(tokenData.repoUrl);

      const decrypted = encryptionHelpers.decryptFields(encrypted, ['accessTokenEncrypted']);

      expect(decrypted).toEqual(tokenData);
    });
  });
});
