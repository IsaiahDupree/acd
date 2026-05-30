/**
 * Robots.txt Validation API (CF-WC-063)
 *
 * API endpoint to validate and preview robots.txt configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateRobotsConfig, generateRobotsTxt } from '../../../../lib/robots-config';

export async function POST(request: NextRequest) {
  try {
    const config = await request.json();

    // Validate configuration
    const validation = validateRobotsConfig(config);

    if (!validation.valid) {
      return NextResponse.json(
        {
          valid: false,
          errors: validation.errors,
          warnings: validation.warnings,
        },
        { status: 400 }
      );
    }

    // Generate preview
    const preview = generateRobotsTxt(config);

    return NextResponse.json({
      valid: true,
      warnings: validation.warnings,
      preview,
    });
  } catch (error) {
    console.error('Robots validation failed:', error);
    return NextResponse.json(
      { error: 'Invalid configuration format' },
      { status: 400 }
    );
  }
}
