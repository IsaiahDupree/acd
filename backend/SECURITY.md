# Security Documentation

## Dependency Vulnerability Scanning

This project implements automated dependency vulnerability scanning through multiple layers:

### 1. NPM Audit

#### Local Development
Run security audits locally before committing:

```bash
# Quick audit (fails on moderate+ vulnerabilities)
npm run security:audit

# Fix non-breaking vulnerabilities automatically
npm run security:audit:fix

# Fix all vulnerabilities (including breaking changes)
npm run security:audit:force
```

#### CI/CD Integration
- **GitHub Actions**: Runs `npm audit` on every push and PR
- **Schedule**: Daily automated scans at 2 AM UTC
- **Thresholds**: Fails on CRITICAL or HIGH severity vulnerabilities

### 2. Dependabot

Automated dependency updates are configured in `.github/dependabot.yml`:

- **Weekly scans** for all package.json files
- **Automatic PRs** for security patches
- **Grouped updates** for easier review
- **Coverage**:
  - Root dependencies
  - Backend (`/backend`)
  - Auth package (`/packages/auth`)
  - Infrastructure package (`/packages/infrastructure`)
  - Platform package (`/packages/platform`)
  - GitHub Actions

#### Dependabot Alerts
- Enabled in GitHub repository settings
- Automatically creates security advisories
- Email notifications for critical vulnerabilities

### 3. Trivy Scanner

Trivy provides comprehensive vulnerability scanning:

- **Filesystem scanning** for known CVEs
- **SARIF output** uploaded to GitHub Security tab
- **License scanning** (blocks GPL-3.0, AGPL-3.0)

### 4. Dependency Review

For pull requests:
- Reviews all dependency changes
- Blocks PRs with moderate+ vulnerabilities
- Checks license compatibility

## Vulnerability Response Process

### Priority Levels

| Severity | Response Time | Action |
|----------|---------------|--------|
| Critical | 24 hours | Immediate patch/hotfix |
| High | 3 days | Scheduled patch in next release |
| Moderate | 1 week | Include in sprint planning |
| Low | 30 days | Backlog item |

### Remediation Steps

1. **Automated Fixes** (Dependabot)
   - Review and merge Dependabot PRs weekly
   - Test automated updates in staging first

2. **Manual Fixes**
   ```bash
   # Identify vulnerable packages
   npm audit

   # Update specific package
   npm update <package-name>

   # If no fix available, consider alternatives
   npm audit fix --force  # Last resort - may break things
   ```

3. **No Fix Available**
   - Document the vulnerability in KNOWN_ISSUES.md
   - Implement mitigation controls
   - Monitor for upstream fixes
   - Consider alternative packages

## Security Monitoring

### GitHub Security Features

Enabled for this repository:
- ✅ Dependabot alerts
- ✅ Dependabot security updates
- ✅ Code scanning (Trivy)
- ✅ Secret scanning
- ✅ Dependency graph

### Alert Channels

- **Email**: Critical and high severity alerts
- **GitHub**: Security tab for all findings
- **CI/CD**: Build failures for vulnerable dependencies
- **Slack**: (Optional) Configure webhook for alerts

## Best Practices

1. **Keep Dependencies Updated**
   - Review and merge Dependabot PRs promptly
   - Don't let security updates pile up

2. **Minimize Dependencies**
   - Regularly audit `package.json`
   - Remove unused dependencies
   - Prefer well-maintained packages

3. **Lock File Management**
   - Commit `package-lock.json`
   - Don't manually edit lock files
   - Run `npm ci` in CI/CD for reproducible builds

4. **Version Pinning**
   - Use exact versions for critical dependencies
   - Use ranges for dev dependencies
   - Document version constraints

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Email: security@yourdomain.com
3. Use GitHub Security Advisories (private disclosure)
4. Include:
   - Vulnerability description
   - Steps to reproduce
   - Affected versions
   - Suggested fix (if known)

## Compliance

This scanning setup helps maintain compliance with:
- SOC 2 Type II (change management)
- ISO 27001 (asset management)
- PCI DSS (requirement 6.2 - security patches)
- GDPR (security measures)
