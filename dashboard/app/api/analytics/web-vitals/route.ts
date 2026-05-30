/**
 * Web Vitals API Endpoint (CF-WC-059)
 *
 * Receives and stores Core Web Vitals metrics.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.metric || !body.value) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // In a production app, you would store this in a database
    // For now, we'll just log it
    console.log('[Web Vitals]', {
      metric: body.metric,
      value: body.value,
      rating: body.rating,
      url: body.url,
      timestamp: new Date(body.timestamp).toISOString(),
    });

    // TODO: Store in database
    // await prisma.webVital.create({ data: body });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to process web vital:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
