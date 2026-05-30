/**
 * OG Image Generation API (CF-WC-066)
 *
 * Generates dynamic Open Graph images with custom text and branding.
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Get params
    const title = searchParams.get('title') || 'Content Factory';
    const description = searchParams.get('description') || 'AI-powered content generation';
    const theme = searchParams.get('theme') || 'default'; // default, dark, gradient

    // Cache headers (24 hours)
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    headers.set('Content-Type', 'image/png');

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme === 'dark' ? '#111827' : theme === 'gradient' ? '#f3f4f6' : '#ffffff',
            backgroundImage: theme === 'gradient' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : undefined,
            padding: '80px',
          }}
        >
          {/* Logo/Brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '40px',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                backgroundColor: theme === 'dark' || theme === 'gradient' ? '#ffffff' : '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '36px',
                marginRight: '20px',
              }}
            >
              🎬
            </div>
            <div
              style={{
                fontSize: '32px',
                fontWeight: '700',
                color: theme === 'dark' || theme === 'gradient' ? '#ffffff' : '#111827',
              }}
            >
              Content Factory
            </div>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: '64px',
              fontWeight: '900',
              textAlign: 'center',
              color: theme === 'dark' || theme === 'gradient' ? '#ffffff' : '#111827',
              marginBottom: '24px',
              maxWidth: '900px',
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>

          {/* Description */}
          {description && (
            <div
              style={{
                fontSize: '32px',
                textAlign: 'center',
                color: theme === 'dark' || theme === 'gradient' ? '#d1d5db' : '#6b7280',
                maxWidth: '800px',
                lineHeight: 1.4,
              }}
            >
              {description}
            </div>
          )}

          {/* Footer badge */}
          <div
            style={{
              position: 'absolute',
              bottom: '60px',
              right: '60px',
              display: 'flex',
              alignItems: 'center',
              padding: '16px 32px',
              borderRadius: '12px',
              backgroundColor: theme === 'dark' || theme === 'gradient' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              fontSize: '20px',
              fontWeight: '600',
              color: theme === 'dark' || theme === 'gradient' ? '#ffffff' : '#111827',
            }}
          >
            ✨ AI-Powered
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers,
      }
    );
  } catch (error) {
    console.error('OG image generation failed:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
