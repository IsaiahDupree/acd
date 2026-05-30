/**
 * Canonical Link Component (CF-WC-065)
 *
 * Component to inject canonical link tags for duplicate content prevention.
 */

'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { getCanonicalUrl, shouldPreserveQueryParams } from '../lib/seo';

function CanonicalLinkInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Remove any existing canonical link
    const existing = document.querySelector('link[rel="canonical"]');
    if (existing) {
      existing.remove();
    }

    // Generate canonical URL
    let canonicalUrl = getCanonicalUrl(pathname);

    // Add query params if needed
    if (shouldPreserveQueryParams(pathname, searchParams)) {
      const params = new URLSearchParams(searchParams.toString());
      if (params.toString()) {
        canonicalUrl += `?${params.toString()}`;
      }
    }

    // Create and inject canonical link
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.href = canonicalUrl;
    document.head.appendChild(link);

    return () => {
      // Cleanup on unmount
      const current = document.querySelector('link[rel="canonical"]');
      if (current) {
        current.remove();
      }
    };
  }, [pathname, searchParams]);

  return null;
}

export function CanonicalLink() {
  // useSearchParams() must be wrapped in a Suspense boundary to avoid
  // de-opting the whole route to client-side rendering during prerender.
  return (
    <Suspense fallback={null}>
      <CanonicalLinkInner />
    </Suspense>
  );
}
