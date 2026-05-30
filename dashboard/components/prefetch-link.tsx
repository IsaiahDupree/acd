/**
 * PrefetchLink Component (CF-WC-058)
 *
 * Enhanced Link component with aggressive prefetching for better navigation performance.
 * Automatically prefetches route data when links enter the viewport.
 */

'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { LinkProps } from 'next/link';

interface PrefetchLinkProps extends Omit<LinkProps, 'prefetch'> {
  children: React.ReactNode;
  className?: string;
  prefetchData?: () => Promise<void>;
  aggressivePrefetch?: boolean;
}

export function PrefetchLink({
  children,
  className,
  prefetchData,
  aggressivePrefetch = true,
  ...linkProps
}: PrefetchLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!aggressivePrefetch || !linkRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && prefetchData) {
            // Prefetch data when link is visible
            prefetchData().catch(console.error);
          }
        });
      },
      { rootMargin: '50px' } // Start prefetching 50px before entering viewport
    );

    observer.observe(linkRef.current);

    return () => {
      if (linkRef.current) {
        observer.unobserve(linkRef.current);
      }
    };
  }, [aggressivePrefetch, prefetchData]);

  return (
    <Link
      ref={linkRef}
      {...linkProps}
      prefetch={true}
      className={className}
    >
      {children}
    </Link>
  );
}
