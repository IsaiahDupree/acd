/**
 * Sitemap Generator Utilities (CF-WC-062)
 *
 * Utilities for generating and updating sitemaps programmatically.
 */

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export interface SitemapConfig {
  baseUrl: string;
  defaultChangeFrequency?: SitemapEntry['changeFrequency'];
  defaultPriority?: number;
}

/**
 * Create a sitemap entry with defaults
 */
export function createSitemapEntry(
  path: string,
  config: SitemapConfig,
  overrides?: Partial<SitemapEntry>
): SitemapEntry {
  const url = path.startsWith('http') ? path : `${config.baseUrl}${path}`;

  return {
    url,
    lastModified: new Date(),
    changeFrequency: config.defaultChangeFrequency || 'weekly',
    priority: config.defaultPriority || 0.5,
    ...overrides,
  };
}

/**
 * Generate sitemap entries for a list of paths
 */
export function generateSitemapEntries(
  paths: string[],
  config: SitemapConfig,
  getPriority?: (path: string) => number,
  getChangeFrequency?: (path: string) => SitemapEntry['changeFrequency']
): SitemapEntry[] {
  return paths.map((path) => {
    const priority = getPriority ? getPriority(path) : config.defaultPriority;
    const changeFrequency = getChangeFrequency
      ? getChangeFrequency(path)
      : config.defaultChangeFrequency;

    return createSitemapEntry(path, config, {
      priority,
      changeFrequency,
    });
  });
}

/**
 * Priority calculator for different route types
 */
export function calculateRoutePriority(path: string): number {
  // Homepage
  if (path === '/' || path === '') {
    return 1.0;
  }

  // Main product pages
  if (path.match(/^\/schema-docs$/)) {
    return 0.9;
  }

  // Important sub-pages
  if (
    path.match(/\/(ads|hooks|analytics|dossiers)$/) ||
    path.match(/\/(dashboard|settings)$/)
  ) {
    return 0.8;
  }

  // Individual items (products, campaigns, etc.)
  if (path.match(/\/[a-f0-9-]+$/)) {
    return 0.7;
  }

  // Detail pages
  if (path.includes('/details/') || path.includes('/edit/')) {
    return 0.6;
  }

  // Default for other pages
  return 0.5;
}

/**
 * Change frequency calculator
 */
export function calculateChangeFrequency(
  path: string
): SitemapEntry['changeFrequency'] {
  // Homepage and main dashboards update frequently
  if (path === '/') {
    return 'daily';
  }

  // Analytics and active content pages
  if (path.includes('analytics') || path.includes('dashboard')) {
    return 'daily';
  }

  // Content items
  if (path.includes('dossiers') || path.includes('ads') || path.includes('hooks')) {
    return 'weekly';
  }

  // Settings and configuration
  if (path.includes('settings') || path.includes('config')) {
    return 'monthly';
  }

  return 'weekly';
}

/**
 * Validate sitemap entries
 */
export function validateSitemapEntries(entries: SitemapEntry[]): {
  valid: SitemapEntry[];
  invalid: { entry: SitemapEntry; reason: string }[];
} {
  const valid: SitemapEntry[] = [];
  const invalid: { entry: SitemapEntry; reason: string }[] = [];

  entries.forEach((entry) => {
    // Check URL format
    if (!entry.url || !entry.url.startsWith('http')) {
      invalid.push({ entry, reason: 'Invalid URL format' });
      return;
    }

    // Check priority range
    if (entry.priority !== undefined && (entry.priority < 0 || entry.priority > 1)) {
      invalid.push({ entry, reason: 'Priority must be between 0 and 1' });
      return;
    }

    valid.push(entry);
  });

  return { valid, invalid };
}
