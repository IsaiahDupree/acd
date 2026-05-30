/**
 * File Upload Security Tests (PCT-WC-039)
 * ========================================
 *
 * Tests for secure file upload validation:
 * - MIME type checking
 * - File size limits
 * - Extension whitelist
 * - File isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    validateFileUpload,
    validateFileSignature,
    sanitizeFilename,
    generateSecureFilename,
    createIsolatedUploadDir,
    getSafeFilePath,
    getFileUploadConfig,
} from '../middleware/file-upload-security';

describe('File Upload Security (PCT-WC-039)', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-upload-test-'));
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('File Upload Configuration', () => {
        it('should use secure defaults', () => {
            const config = getFileUploadConfig();
            expect(config.maxFileSize).toBe(10 * 1024 * 1024); // 10MB
            expect(config.sanitizeFilenames).toBe(true);
            expect(config.validateContent).toBe(true);
            expect(config.isolateFiles).toBe(true);
        });

        it('should allow custom configuration', () => {
            const config = getFileUploadConfig({
                maxFileSize: 5 * 1024 * 1024, // 5MB
                uploadDir: './custom-uploads',
            });
            expect(config.maxFileSize).toBe(5 * 1024 * 1024);
            expect(config.uploadDir).toBe('./custom-uploads');
        });
    });

    describe('Filename Sanitization', () => {
        it('should remove path traversal attempts', () => {
            const malicious = '../../../etc/passwd';
            const sanitized = sanitizeFilename(malicious);
            expect(sanitized).not.toContain('..');
            expect(sanitized).not.toContain('/');
        });

        it('should remove special characters', () => {
            const unsafe = 'file<script>alert(1)</script>.jpg';
            const sanitized = sanitizeFilename(unsafe);
            expect(sanitized).not.toContain('<');
            expect(sanitized).not.toContain('>');
            expect(sanitized).not.toContain('(');
            expect(sanitized).not.toContain(')');
            // Note: alphabetic characters like 'script' are safe and should be preserved
            expect(sanitized).toMatch(/^[a-zA-Z0-9._-]+$/);
        });

        it('should preserve safe characters', () => {
            const safe = 'my-file_name.123.jpg';
            const sanitized = sanitizeFilename(safe);
            expect(sanitized).toBe('my-file_name.123.jpg');
        });

        it('should prevent hidden files', () => {
            const hidden = '.htaccess';
            const sanitized = sanitizeFilename(hidden);
            expect(sanitized.startsWith('.')).toBe(false);
        });

        it('should handle empty filenames', () => {
            const empty = '';
            const sanitized = sanitizeFilename(empty);
            expect(sanitized).toBe('unnamed_file');
        });
    });

    describe('Secure Filename Generation', () => {
        it('should generate random filename', () => {
            const filename = generateSecureFilename('test.jpg');
            expect(filename).toMatch(/^[a-f0-9]{32}\.jpg$/);
        });

        it('should preserve file extension', () => {
            const filename = generateSecureFilename('document.pdf');
            expect(filename.endsWith('.pdf')).toBe(true);
        });

        it('should generate unique filenames', () => {
            const filename1 = generateSecureFilename('test.jpg');
            const filename2 = generateSecureFilename('test.jpg');
            expect(filename1).not.toBe(filename2);
        });
    });

    describe('File Validation - Size Limit (PCT-WC-039 criteria)', () => {
        it('should reject files exceeding size limit', () => {
            const file = {
                originalname: 'large.jpg',
                mimetype: 'image/jpeg',
                size: 50 * 1024 * 1024, // 50MB (exceeds 10MB default)
            };

            const result = validateFileUpload(file);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
        });

        it('should accept files within size limit', () => {
            const file = {
                originalname: 'small.jpg',
                mimetype: 'image/jpeg',
                size: 1 * 1024 * 1024, // 1MB
            };

            const result = validateFileUpload(file);
            expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(false);
        });
    });

    describe('File Validation - MIME Type (PCT-WC-039 criteria)', () => {
        it('should reject disallowed MIME types', () => {
            const file = {
                originalname: 'script.exe',
                mimetype: 'application/x-msdownload',
                size: 1024,
            };

            const result = validateFileUpload(file);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('MIME type') && e.includes('not allowed'))).toBe(true);
        });

        it('should accept allowed MIME types', () => {
            const file = {
                originalname: 'image.jpg',
                mimetype: 'image/jpeg',
                size: 1024,
            };

            const result = validateFileUpload(file);
            expect(result.errors.some(e => e.includes('MIME type'))).toBe(false);
        });
    });

    describe('File Validation - Extension Whitelist (PCT-WC-039 criteria)', () => {
        it('should reject disallowed extensions', () => {
            const file = {
                originalname: 'malware.exe',
                mimetype: 'application/pdf', // Lying about MIME type
                size: 1024,
            };

            const result = validateFileUpload(file);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('extension') && e.includes('not allowed'))).toBe(true);
        });

        it('should accept allowed extensions', () => {
            const file = {
                originalname: 'document.pdf',
                mimetype: 'application/pdf',
                size: 1024,
            };

            const result = validateFileUpload(file);
            expect(result.errors.some(e => e.includes('extension'))).toBe(false);
        });

        it('should be case-insensitive', () => {
            const file = {
                originalname: 'IMAGE.JPG',
                mimetype: 'image/jpeg',
                size: 1024,
            };

            const result = validateFileUpload(file);
            expect(result.errors.some(e => e.includes('extension'))).toBe(false);
        });
    });

    describe('File Signature Validation', () => {
        it('should validate JPEG signature', () => {
            const jpegPath = path.join(tempDir, 'test.jpg');
            // Create a file with JPEG magic bytes
            const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
            fs.writeFileSync(jpegPath, jpegBuffer);

            const isValid = validateFileSignature(jpegPath, 'image/jpeg');
            expect(isValid).toBe(true);
        });

        it('should validate PNG signature', () => {
            const pngPath = path.join(tempDir, 'test.png');
            // Create a file with PNG magic bytes
            const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
            fs.writeFileSync(pngPath, pngBuffer);

            const isValid = validateFileSignature(pngPath, 'image/png');
            expect(isValid).toBe(true);
        });

        it('should reject mismatched signatures', () => {
            const fakePath = path.join(tempDir, 'fake.jpg');
            // Create a file with wrong magic bytes
            const fakeBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
            fs.writeFileSync(fakePath, fakeBuffer);

            const isValid = validateFileSignature(fakePath, 'image/jpeg');
            expect(isValid).toBe(false);
        });
    });

    describe('File Isolation (PCT-WC-039 criteria)', () => {
        it('should create isolated upload directories', () => {
            const uploadDir = createIsolatedUploadDir(tempDir, 'user123');
            expect(fs.existsSync(uploadDir)).toBe(true);
            expect(uploadDir).toContain('user123');
        });

        it('should organize by date', () => {
            const uploadDir = createIsolatedUploadDir(tempDir);
            const date = new Date();
            const year = date.getFullYear();
            expect(uploadDir).toContain(String(year));
        });

        it('should generate isolated target path', () => {
            const file = {
                originalname: 'test.jpg',
                mimetype: 'image/jpeg',
                size: 1024,
            };

            const result = validateFileUpload(file, { isolateFiles: true, uploadDir: tempDir }, 'user123');
            expect(result.targetPath).toBeDefined();
            expect(result.targetPath).toContain(tempDir);
            expect(result.targetPath).toContain('user123');
        });
    });

    describe('Path Traversal Protection', () => {
        it('should reject path traversal attempts', () => {
            const baseDir = tempDir;
            const maliciousPath = '../../../etc/passwd';

            const safePath = getSafeFilePath(baseDir, maliciousPath);
            expect(safePath).toBeNull();
        });

        it('should allow safe paths', () => {
            const baseDir = tempDir;
            const testFile = path.join(baseDir, 'test.txt');
            fs.writeFileSync(testFile, 'test');

            const safePath = getSafeFilePath(baseDir, 'test.txt');
            expect(safePath).not.toBeNull();
            expect(safePath).toContain('test.txt');
        });

        it('should reject non-existent files', () => {
            const baseDir = tempDir;
            const safePath = getSafeFilePath(baseDir, 'nonexistent.txt');
            expect(safePath).toBeNull();
        });
    });

    describe('Acceptance Criteria (PCT-WC-039)', () => {
        it('should verify MIME check is implemented', () => {
            const file = {
                originalname: 'test.exe',
                mimetype: 'application/x-msdownload',
                size: 1024,
            };

            const result = validateFileUpload(file);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('MIME type'))).toBe(true);
        });

        it('should verify size limit is implemented', () => {
            const file = {
                originalname: 'large.jpg',
                mimetype: 'image/jpeg',
                size: 100 * 1024 * 1024, // 100MB
            };

            const result = validateFileUpload(file);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('size'))).toBe(true);
        });

        it('should verify whitelist is implemented', () => {
            const file = {
                originalname: 'malware.exe',
                mimetype: 'application/pdf',
                size: 1024,
            };

            const result = validateFileUpload(file);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('extension'))).toBe(true);
        });

        it('should verify isolation is implemented', () => {
            const file = {
                originalname: 'test.jpg',
                mimetype: 'image/jpeg',
                size: 1024,
            };

            const result = validateFileUpload(file, { isolateFiles: true, uploadDir: tempDir }, 'user123');
            expect(result.targetPath).toBeDefined();
            expect(result.targetPath).toContain('user123');
        });
    });
});
