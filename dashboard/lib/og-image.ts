/**
 * OG Image Utilities (CF-WC-066)
 *
 * Utilities for generating and caching Open Graph images.
 */

export interface OGImageConfig {
  title: string;
  description?: string;
  theme?: 'default' | 'dark' | 'gradient';
  cached?: boolean;
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentfactory.example.com';

/**
 * Generate OG image URL with params
 */
export function generateOGImageUrl(config: OGImageConfig): string {
  const params = new URLSearchParams();
  params.set('title', config.title);

  if (config.description) {
    params.set('description', config.description);
  }

  if (config.theme) {
    params.set('theme', config.theme);
  }

  return `${BASE_URL}/api/og?${params.toString()}`;
}

/**
 * Generate OG image for product
 */
export function generateProductOGImage(product: {
  name: string;
  tagline?: string;
}): string {
  return generateOGImageUrl({
    title: product.name,
    description: product.tagline,
    theme: 'gradient',
  });
}

/**
 * Generate OG image for article
 */
export function generateArticleOGImage(article: {
  title: string;
  excerpt?: string;
}): string {
  return generateOGImageUrl({
    title: article.title,
    description: article.excerpt,
    theme: 'default',
  });
}

/**
 * Generate OG image for page
 */
export function generatePageOGImage(page: {
  title: string;
  description?: string;
  isDark?: boolean;
}): string {
  return generateOGImageUrl({
    title: page.title,
    description: page.description,
    theme: page.isDark ? 'dark' : 'default',
  });
}

/**
 * Cache OG image in browser
 */
export function preloadOGImage(url: string): void {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * Get OG image with cache busting
 */
export function getOGImageWithCacheBust(config: OGImageConfig): string {
  const url = generateOGImageUrl(config);
  // Add cache bust param only if not cached
  if (!config.cached) {
    return `${url}&v=${Date.now()}`;
  }
  return url;
}
