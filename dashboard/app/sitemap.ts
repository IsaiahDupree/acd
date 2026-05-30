/**
 * XML Sitemap Generation (CF-WC-062)
 *
 * Auto-generates sitemap.xml with all routes, priorities, and auto-updates.
 */

import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentfactory.example.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes for the Autonomous Coding Dashboard
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/schema-docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];

  return staticRoutes;
}
