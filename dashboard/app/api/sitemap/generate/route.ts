/**
 * Sitemap Generation API (CF-WC-062)
 *
 * API endpoint to trigger sitemap generation/update.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateSitemapEntries,
  calculateRoutePriority,
  calculateChangeFrequency,
  validateSitemapEntries,
} from '../../../../lib/sitemap-generator';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentfactory.example.com';

export async function GET(request: NextRequest) {
  try {
    const config = {
      baseUrl: BASE_URL,
      defaultChangeFrequency: 'weekly' as const,
      defaultPriority: 0.5,
    };

    // Gather all routes
    const staticPaths = [
      '/',
      '/schema-docs',
    ];

    // Generate entries
    const entries = generateSitemapEntries(
      staticPaths,
      config,
      calculateRoutePriority,
      calculateChangeFrequency
    );

    // Validate
    const { valid, invalid } = validateSitemapEntries(entries);

    return NextResponse.json({
      success: true,
      sitemap: {
        entryCount: valid.length,
        entries: valid,
      },
      ...(invalid.length > 0 && {
        warnings: {
          invalidEntries: invalid.length,
          issues: invalid,
        },
      }),
    });
  } catch (error) {
    console.error('Sitemap generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate sitemap' },
      { status: 500 }
    );
  }
}
