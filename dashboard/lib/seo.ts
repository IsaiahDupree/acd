/**
 * SEO Utilities (CF-WC-061, CF-WC-065)
 *
 * Utilities for generating dynamic meta tags including titles, descriptions,
 * Open Graph, Twitter cards, and canonical URLs.
 */

import type { Metadata } from 'next';
import { generateOGImageUrl } from './og-image';

export interface SEOConfig {
  title: string;
  description: string;
  keywords?: string[];
  author?: string;
  image?: string;
  url?: string;
  canonical?: string;
  type?: 'website' | 'article' | 'product';
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  twitterSite?: string;
  twitterCreator?: string;
}

const DEFAULT_CONFIG = {
  siteName: 'Content Factory',
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'https://contentfactory.example.com',
  defaultImage: '/og-default.png',
  twitterSite: '@contentfactory',
  locale: 'en_US',
};

/**
 * Clean URL for canonical (remove query params and fragments)
 */
export function cleanUrlForCanonical(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove query params and hash
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`.replace(/\/$/, '');
  } catch {
    // If URL parsing fails, return as-is
    return url.replace(/[?#].*$/, '').replace(/\/$/, '');
  }
}

/**
 * Generate canonical URL from pathname
 */
export function getCanonicalUrl(pathname: string): string {
  const cleanPath = pathname.replace(/[?#].*$/, '').replace(/\/$/, '');
  return `${DEFAULT_CONFIG.baseUrl}${cleanPath}`;
}

/**
 * Check if query params should be preserved in canonical URL
 */
export function shouldPreserveQueryParams(pathname: string, params: URLSearchParams): boolean {
  // Preserve pagination params
  if (params.has('page')) {
    return true;
  }

  // Preserve filter params on specific routes
  if (pathname.includes('/search') || pathname.includes('/filter')) {
    return true;
  }

  return false;
}

/**
 * Generate complete metadata for a page
 */
export function generateMetadata(config: SEOConfig): Metadata {
  const {
    title,
    description,
    keywords,
    author,
    image,
    url,
    canonical,
    type = 'website',
    publishedTime,
    modifiedTime,
    section,
    tags,
    twitterCard = 'summary_large_image',
    twitterSite,
    twitterCreator,
  } = config;

  const fullTitle = `${title} | ${DEFAULT_CONFIG.siteName}`;
  // Use dynamic OG image if no custom image provided
  const imageUrl = image || generateOGImageUrl({ title, description, theme: 'gradient' });
  const pageUrl = url || DEFAULT_CONFIG.baseUrl;
  const canonicalUrl = canonical || cleanUrlForCanonical(pageUrl);

  const metadata: Metadata = {
    title: fullTitle,
    description,
    keywords: keywords?.join(', '),
    authors: author ? [{ name: author }] : undefined,
    alternates: {
      canonical: canonicalUrl,
    },

    // Open Graph
    openGraph: {
      title: fullTitle,
      description,
      url: pageUrl,
      siteName: DEFAULT_CONFIG.siteName,
      locale: DEFAULT_CONFIG.locale,
      // Next.js Metadata OpenGraph type only supports 'article' | 'website' in this
      // object shape; map 'product' to 'website' (product OG requires extra fields).
      type: type === 'article' ? 'article' : 'website',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      ...(type === 'article' && {
        publishedTime,
        modifiedTime,
        section,
        tags,
      }),
    },

    // Twitter Card
    twitter: {
      card: twitterCard,
      site: twitterSite || DEFAULT_CONFIG.twitterSite,
      creator: twitterCreator,
      title: fullTitle,
      description,
      images: [imageUrl],
    },

    // Additional metadata
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },

    // Verification
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
  };

  return metadata;
}

/**
 * Generate metadata for product pages
 */
export function generateProductMetadata(
  product: {
    id: string;
    name: string;
    description: string;
    price?: number;
    image?: string;
    brand?: string;
  }
): Metadata {
  return generateMetadata({
    title: product.name,
    description: product.description,
    type: 'product',
    image: product.image,
    url: `${DEFAULT_CONFIG.baseUrl}/products/${product.id}`,
    keywords: [product.name, product.brand, 'content factory', 'social commerce'].filter(Boolean) as string[],
  });
}

/**
 * Generate metadata for blog/article pages
 */
export function generateArticleMetadata(
  article: {
    title: string;
    description: string;
    image?: string;
    author?: string;
    publishedAt: Date;
    updatedAt?: Date;
    section?: string;
    tags?: string[];
  }
): Metadata {
  return generateMetadata({
    title: article.title,
    description: article.description,
    type: 'article',
    image: article.image,
    author: article.author,
    publishedTime: article.publishedAt.toISOString(),
    modifiedTime: article.updatedAt?.toISOString(),
    section: article.section,
    tags: article.tags,
  });
}

/**
 * Default metadata for fallback
 */
export const defaultMetadata: Metadata = generateMetadata({
  title: 'AI-Powered Content Generation',
  description: 'Create engaging social commerce content with AI. Generate videos, images, and scripts for TikTok, Instagram, and Facebook.',
  keywords: ['content factory', 'AI content', 'social commerce', 'video generation', 'TikTok content'],
  type: 'website',
});
