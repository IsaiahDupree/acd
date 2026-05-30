/**
 * Robots.txt Configuration (CF-WC-063)
 *
 * Configures robots.txt with public/admin route rules.
 */

import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentfactory.example.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/schema-docs',
          '/api/public',
        ],
        disallow: [
          '/api/admin',
          '/api/private',
          '/admin',
          '/dashboard/settings',
          '/*?api_key=*',
          '/*?token=*',
          '/api/analytics',
          '/api/sitemap',
        ],
        crawlDelay: 1,
      },
      // Specific rules for AI bots
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'CCBot', 'anthropic-ai'],
        disallow: ['/'],
      },
      // Allow Google/Bing for better indexing
      {
        userAgent: ['Googlebot', 'Bingbot'],
        allow: '/',
        disallow: [
          '/api',
          '/admin',
          '/*?api_key=*',
          '/*?token=*',
        ],
        crawlDelay: 0.5,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
