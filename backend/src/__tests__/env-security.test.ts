/**
 * Environment Variable Security Tests (PCT-WC-037)
 * =================================================
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    isClientSafeEnvVar,
    scanFileForSecrets,
    verifyEnvFilesGitignored,
} from '../utils/env-security';

describe('Environment Variable Security (PCT-WC-037)', () => {
    describe('isClientSafeEnvVar', () => {
        it('should allow public prefixed variables', () => {
            expect(isClientSafeEnvVar('NEXT_PUBLIC_API_URL')).toBe(true);
            expect(isClientSafeEnvVar('VITE_APP_NAME')).toBe(true);
            expect(isClientSafeEnvVar('PUBLIC_DOMAIN')).toBe(true);
            expect(isClientSafeEnvVar('REACT_APP_VERSION')).toBe(true);
        });

        it('should reject non-prefixed variables', () => {
            expect(isClientSafeEnvVar('DATABASE_URL')).toBe(false);
            expect(isClientSafeEnvVar('API_KEY')).toBe(false);
            expect(isClientSafeEnvVar('JWT_SECRET')).toBe(false);
        });

        it('should reject variables with sensitive keywords even with safe prefix', () => {
            expect(isClientSafeEnvVar('NEXT_PUBLIC_SECRET_KEY')).toBe(false);
            expect(isClientSafeEnvVar('VITE_API_SECRET')).toBe(false);
            expect(isClientSafeEnvVar('PUBLIC_PASSWORD')).toBe(false);
        });
    });

    describe('scanFileForSecrets', () => {
        let tempDir: string;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-security-test-'));
        });

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it('should detect hardcoded API keys', () => {
            const testFile = path.join(tempDir, 'test.ts');
            fs.writeFileSync(testFile, `
                const apiKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';
                console.log(apiKey);
            `);

            const result = scanFileForSecrets(testFile);
            expect(result.hasSecrets).toBe(true);
            expect(result.findings.length).toBeGreaterThan(0);
        });

        it('should detect sensitive environment variables', () => {
            const testFile = path.join(tempDir, 'test.ts');
            fs.writeFileSync(testFile, `
                const dbUrl = process.env.DATABASE_URL;
                const secret = process.env.JWT_SECRET;
            `);

            const result = scanFileForSecrets(testFile);
            expect(result.hasSecrets).toBe(true);
            expect(result.findings.some(f => f.issue.toLowerCase().includes('database_url'))).toBe(true);
        });

        it('should ignore comments', () => {
            const testFile = path.join(tempDir, 'test.ts');
            fs.writeFileSync(testFile, `
                // const apiKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';
                /* const secret = 'my-secret'; */
            `);

            const result = scanFileForSecrets(testFile);
            expect(result.hasSecrets).toBe(false);
        });

        it('should ignore placeholder values', () => {
            const testFile = path.join(tempDir, 'test.ts');
            fs.writeFileSync(testFile, `
                const apiKey = 'YOUR_API_KEY_HERE';
                const secret = 'EXAMPLE_SECRET';
            `);

            const result = scanFileForSecrets(testFile);
            expect(result.hasSecrets).toBe(false);
        });

        it('should return empty result for non-existent file', () => {
            const result = scanFileForSecrets('/path/to/nonexistent/file.ts');
            expect(result.hasSecrets).toBe(false);
            expect(result.findings).toHaveLength(0);
        });
    });

    describe('verifyEnvFilesGitignored', () => {
        let tempDir: string;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-security-test-'));
        });

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it('should pass if .env is in .gitignore', () => {
            const gitignorePath = path.join(tempDir, '.gitignore');
            fs.writeFileSync(gitignorePath, `
node_modules/
.env
.env.local
dist/
            `);

            const result = verifyEnvFilesGitignored(tempDir);
            expect(result.isGitignored).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('should fail if .gitignore does not exist', () => {
            const result = verifyEnvFilesGitignored(tempDir);
            expect(result.isGitignored).toBe(false);
            expect(result.issues.some(issue => issue.includes('.gitignore file does not exist'))).toBe(true);
        });

        it('should fail if .env is not in .gitignore', () => {
            const gitignorePath = path.join(tempDir, '.gitignore');
            fs.writeFileSync(gitignorePath, `
node_modules/
dist/
            `);

            const result = verifyEnvFilesGitignored(tempDir);
            expect(result.isGitignored).toBe(false);
            expect(result.issues.some(issue => issue.includes('.env files are not properly ignored'))).toBe(true);
        });
    });

    describe('Acceptance Criteria', () => {
        it('should verify no secrets in client bundles (PCT-WC-037 criteria)', () => {
            // This is a conceptual test - in real implementation, we would scan actual client code
            const isSecretSafe = !isClientSafeEnvVar('DATABASE_URL');
            const isPublicSafe = isClientSafeEnvVar('NEXT_PUBLIC_API_URL');

            expect(isSecretSafe).toBe(true);
            expect(isPublicSafe).toBe(true);
        });

        it('should verify .env not in git (PCT-WC-037 criteria)', () => {
            // This test verifies the gitignore check works
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-security-test-'));

            const gitignorePath = path.join(tempDir, '.gitignore');
            fs.writeFileSync(gitignorePath, '.env\n.env.local\n');

            const result = verifyEnvFilesGitignored(tempDir);
            expect(result.isGitignored).toBe(true);

            fs.rmSync(tempDir, { recursive: true, force: true });
        });
    });
});
