/**
 * Environment Variable Security Utilities (PCT-WC-037)
 * ====================================================
 *
 * Utilities to ensure secrets are not leaked to client bundles
 * and environment files are properly secured
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * List of environment variable prefixes that are safe to expose to the client
 * Following Next.js/Vite convention where NEXT_PUBLIC_* or VITE_* vars can be public
 */
const SAFE_CLIENT_PREFIXES = ['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_', 'REACT_APP_'];

/**
 * List of sensitive keywords that should never appear in client code
 */
const SENSITIVE_KEYWORDS = [
    'password',
    'secret',
    'api_key',
    'apikey',
    'private_key',
    'privatekey',
    'token',
    'oauth',
    'database_url',
    'db_url',
    'redis_url',
    'jwt_secret',
    'encryption_key',
    'aws_secret',
    'stripe_secret',
    'anthropic_api_key',
    'claude_api_key',
    'openai_api_key',
];

/**
 * Check if an environment variable name is safe to expose to the client
 */
export function isClientSafeEnvVar(varName: string): boolean {
    const upperVarName = varName.toUpperCase();

    // Check if it starts with a safe prefix
    const hasSafePrefix = SAFE_CLIENT_PREFIXES.some(prefix =>
        upperVarName.startsWith(prefix)
    );

    if (!hasSafePrefix) {
        return false;
    }

    // Even with safe prefix, check if it contains sensitive keywords
    const lowerVarName = varName.toLowerCase();
    const hasSensitiveKeyword = SENSITIVE_KEYWORDS.some(keyword =>
        lowerVarName.includes(keyword)
    );

    return !hasSensitiveKeyword;
}

/**
 * Scan a file for potential secrets (hardcoded keys, tokens, etc.)
 */
export function scanFileForSecrets(filePath: string): {
    hasSecrets: boolean;
    findings: Array<{ line: number; issue: string; snippet: string }>;
} {
    const findings: Array<{ line: number; issue: string; snippet: string }> = [];

    if (!fs.existsSync(filePath)) {
        return { hasSecrets: false, findings: [] };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) {
            return;
        }

        // Check for hardcoded API keys or tokens
        const apiKeyPatterns = [
            /['"]([a-zA-Z0-9_-]{32,})['"]/,  // Long alphanumeric strings
            /sk-[a-zA-Z0-9]{32,}/,            // OpenAI-style keys
            /xoxb-[a-zA-Z0-9-]+/,             // Slack tokens
            /AIza[a-zA-Z0-9_-]{35}/,          // Google API keys
            /sk_live_[a-zA-Z0-9]{24,}/,       // Stripe live keys
            /sk_test_[a-zA-Z0-9]{24,}/,       // Stripe test keys
        ];

        for (const pattern of apiKeyPatterns) {
            if (pattern.test(line) && !line.includes('YOUR_') && !line.includes('EXAMPLE_')) {
                findings.push({
                    line: index + 1,
                    issue: 'Potential hardcoded API key or token',
                    snippet: line.trim().substring(0, 100),
                });
            }
        }

        // Check for environment variables being used without proper protection
        SENSITIVE_KEYWORDS.forEach(keyword => {
            const envVarPattern = new RegExp(`process\\.env\\.(?!${SAFE_CLIENT_PREFIXES.join('|')})[A-Z_]*${keyword}`, 'i');
            if (envVarPattern.test(line)) {
                findings.push({
                    line: index + 1,
                    issue: `Potential secret environment variable: ${keyword}`,
                    snippet: line.trim().substring(0, 100),
                });
            }
        });
    });

    return {
        hasSecrets: findings.length > 0,
        findings,
    };
}

/**
 * Scan a directory for client-side files that might contain secrets
 */
export function scanClientBundleForSecrets(clientDir: string): {
    filesScanned: number;
    filesWithSecrets: number;
    allFindings: Array<{ file: string; line: number; issue: string; snippet: string }>;
} {
    const allFindings: Array<{ file: string; line: number; issue: string; snippet: string }> = [];
    let filesScanned = 0;
    let filesWithSecrets = 0;

    if (!fs.existsSync(clientDir)) {
        return { filesScanned: 0, filesWithSecrets: 0, allFindings: [] };
    }

    function scanDirectory(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                // Skip node_modules and other common directories
                if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
                    scanDirectory(fullPath);
                }
            } else if (entry.isFile()) {
                // Only scan JavaScript/TypeScript files that would be in client bundles
                if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
                    filesScanned++;
                    const result = scanFileForSecrets(fullPath);
                    if (result.hasSecrets) {
                        filesWithSecrets++;
                        result.findings.forEach(finding => {
                            allFindings.push({
                                file: fullPath,
                                ...finding,
                            });
                        });
                    }
                }
            }
        }
    }

    scanDirectory(clientDir);

    return { filesScanned, filesWithSecrets, allFindings };
}

/**
 * Verify that .env files are properly gitignored
 */
export function verifyEnvFilesGitignored(projectRoot: string): {
    isGitignored: boolean;
    issues: string[];
} {
    const issues: string[] = [];
    const gitignorePath = path.join(projectRoot, '.gitignore');

    if (!fs.existsSync(gitignorePath)) {
        issues.push('.gitignore file does not exist');
        return { isGitignored: false, issues };
    }

    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    const lines = gitignoreContent.split('\n').map(l => l.trim());

    // Check for common .env patterns
    const envPatterns = ['.env', '.env.local', '.env.*.local', '**/.env'];
    const hasEnvPattern = envPatterns.some(pattern => lines.includes(pattern));

    if (!hasEnvPattern) {
        issues.push('.env files are not properly ignored in .gitignore');
    }

    // Check if any .env files are tracked in git
    // Note: This would need to run `git ls-files` to check properly

    return {
        isGitignored: issues.length === 0,
        issues,
    };
}

/**
 * Generate a report of environment security issues
 */
export function generateEnvSecurityReport(projectRoot: string): {
    passed: boolean;
    issues: string[];
    recommendations: string[];
} {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check .gitignore
    const gitignoreCheck = verifyEnvFilesGitignored(projectRoot);
    if (!gitignoreCheck.isGitignored) {
        issues.push(...gitignoreCheck.issues);
        recommendations.push('Add .env files to .gitignore to prevent accidental commits');
    }

    // Check for .env.example
    const envExamplePath = path.join(projectRoot, 'backend', '.env.example');
    if (!fs.existsSync(envExamplePath)) {
        issues.push('.env.example file is missing');
        recommendations.push('Create a .env.example file with example values (no real secrets)');
    }

    // Scan client code for secrets
    const frontendDir = path.join(projectRoot, 'frontend', 'src');
    const dashboardDir = path.join(projectRoot, 'dashboard', 'app');

    const frontendScan = scanClientBundleForSecrets(frontendDir);
    const dashboardScan = scanClientBundleForSecrets(dashboardDir);

    if (frontendScan.filesWithSecrets > 0) {
        issues.push(`Found ${frontendScan.filesWithSecrets} frontend files with potential secrets`);
        recommendations.push('Review and remove any hardcoded secrets from frontend code');
    }

    if (dashboardScan.filesWithSecrets > 0) {
        issues.push(`Found ${dashboardScan.filesWithSecrets} dashboard files with potential secrets`);
        recommendations.push('Review and remove any hardcoded secrets from dashboard code');
    }

    return {
        passed: issues.length === 0,
        issues,
        recommendations,
    };
}

/**
 * CLI utility to run security checks
 */
export function runEnvSecurityChecks(): void {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const report = generateEnvSecurityReport(projectRoot);

    console.log('\n=== Environment Variable Security Report (PCT-WC-037) ===\n');

    if (report.passed) {
        console.log('✅ All checks passed!');
    } else {
        console.log('❌ Issues found:\n');
        report.issues.forEach(issue => {
            console.log(`  - ${issue}`);
        });

        if (report.recommendations.length > 0) {
            console.log('\n📋 Recommendations:\n');
            report.recommendations.forEach(rec => {
                console.log(`  - ${rec}`);
            });
        }
    }

    console.log('\n');
}
