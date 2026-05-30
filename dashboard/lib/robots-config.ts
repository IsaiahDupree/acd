/**
 * Robots Configuration Utilities (CF-WC-063)
 *
 * Utilities for managing and validating robots.txt rules.
 */

export interface RobotRule {
  userAgent: string | string[];
  allow?: string[];
  disallow?: string[];
  crawlDelay?: number;
}

export interface RobotsConfig {
  rules: RobotRule[];
  sitemap?: string;
  host?: string;
}

/**
 * Common bot user agents
 */
export const USER_AGENTS = {
  ALL: '*',
  GOOGLE: 'Googlebot',
  BING: 'Bingbot',
  YAHOO: 'Slurp',
  DUCKDUCKGO: 'DuckDuckBot',
  FACEBOOK: 'facebookexternalhit',
  TWITTER: 'Twitterbot',
  LINKEDIN: 'LinkedInBot',
  PINTEREST: 'Pinterest',
  AI_BOTS: ['GPTBot', 'ChatGPT-User', 'CCBot', 'anthropic-ai', 'Claude-Web'],
  BAD_BOTS: [
    'AhrefsBot',
    'SemrushBot',
    'DotBot',
    'MJ12bot',
    'rogerbot',
    'BLEXBot',
  ],
};

/**
 * Common paths to disallow
 */
export const COMMON_DISALLOW_PATHS = {
  ADMIN: ['/admin', '/dashboard/admin', '/admin/*'],
  API: ['/api', '/api/*'],
  PRIVATE_API: ['/api/admin/*', '/api/private/*'],
  AUTH: ['/login', '/logout', '/auth/*', '/api/auth/*'],
  SETTINGS: ['*/settings', '*/settings/*'],
  INTERNAL: ['/_next/*', '/static/*'],
  SENSITIVE_PARAMS: ['/*?api_key=*', '/*?token=*', '/*?secret=*', '/*?password=*'],
  DYNAMIC_PARAMS: ['/*?page=*', '/*?sort=*', '/*?filter=*'],
  STAGING: ['/staging', '/staging/*', '/preview', '/preview/*'],
};

/**
 * Create a rule for public content
 */
export function createPublicRule(
  allowPaths: string[] = ['/'],
  disallowPaths: string[] = []
): RobotRule {
  return {
    userAgent: USER_AGENTS.ALL,
    allow: allowPaths,
    disallow: [
      ...disallowPaths,
      ...COMMON_DISALLOW_PATHS.ADMIN,
      ...COMMON_DISALLOW_PATHS.PRIVATE_API,
      ...COMMON_DISALLOW_PATHS.AUTH,
      ...COMMON_DISALLOW_PATHS.SENSITIVE_PARAMS,
    ],
    crawlDelay: 1,
  };
}

/**
 * Create a rule to block AI bots
 */
export function createAIBotBlockRule(): RobotRule {
  return {
    userAgent: USER_AGENTS.AI_BOTS,
    disallow: ['/'],
  };
}

/**
 * Create a rule to block bad bots
 */
export function createBadBotBlockRule(): RobotRule {
  return {
    userAgent: USER_AGENTS.BAD_BOTS,
    disallow: ['/'],
  };
}

/**
 * Create a rule for search engines
 */
export function createSearchEngineRule(
  allowPaths: string[] = ['/'],
  crawlDelay: number = 0.5
): RobotRule {
  return {
    userAgent: [USER_AGENTS.GOOGLE, USER_AGENTS.BING],
    allow: allowPaths,
    disallow: [
      ...COMMON_DISALLOW_PATHS.API,
      ...COMMON_DISALLOW_PATHS.ADMIN,
      ...COMMON_DISALLOW_PATHS.SENSITIVE_PARAMS,
    ],
    crawlDelay,
  };
}

/**
 * Validate robots.txt configuration
 */
export function validateRobotsConfig(config: RobotsConfig): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if at least one rule exists
  if (!config.rules || config.rules.length === 0) {
    errors.push('At least one rule must be defined');
  }

  // Check each rule
  config.rules.forEach((rule, index) => {
    if (!rule.userAgent) {
      errors.push(`Rule ${index}: userAgent is required`);
    }

    if (!rule.allow && !rule.disallow) {
      warnings.push(`Rule ${index}: Neither allow nor disallow specified`);
    }

    if (rule.crawlDelay && rule.crawlDelay < 0) {
      errors.push(`Rule ${index}: crawlDelay must be >= 0`);
    }
  });

  // Check sitemap URL format
  if (config.sitemap && !config.sitemap.match(/^https?:\/\//)) {
    errors.push('Sitemap must be a valid URL starting with http:// or https://');
  }

  // Check host URL format
  if (config.host && !config.host.match(/^https?:\/\//)) {
    errors.push('Host must be a valid URL starting with http:// or https://');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate robots.txt content as string
 */
export function generateRobotsTxt(config: RobotsConfig): string {
  let content = '';

  config.rules.forEach((rule) => {
    const userAgents = Array.isArray(rule.userAgent)
      ? rule.userAgent
      : [rule.userAgent];

    userAgents.forEach((ua) => {
      content += `User-agent: ${ua}\n`;
    });

    if (rule.allow) {
      rule.allow.forEach((path) => {
        content += `Allow: ${path}\n`;
      });
    }

    if (rule.disallow) {
      rule.disallow.forEach((path) => {
        content += `Disallow: ${path}\n`;
      });
    }

    if (rule.crawlDelay !== undefined) {
      content += `Crawl-delay: ${rule.crawlDelay}\n`;
    }

    content += '\n';
  });

  if (config.sitemap) {
    content += `Sitemap: ${config.sitemap}\n`;
  }

  if (config.host) {
    content += `Host: ${config.host}\n`;
  }

  return content;
}
