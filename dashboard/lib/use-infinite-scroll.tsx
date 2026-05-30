/**
 * Infinite Scroll Hook (CF-WC-089)
 *
 * Auto-load more content when scrolling to the bottom.
 */

import * as React from 'react';

interface InfiniteScrollOptions {
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
  threshold?: number; // pixels from bottom to trigger load
  enabled?: boolean;
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  threshold = 200,
  enabled = true,
}: InfiniteScrollOptions) {
  const [isLoading, setIsLoading] = React.useState(false);
  const observerRef = React.useRef<IntersectionObserver | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const loadMore = React.useCallback(async () => {
    if (isLoading || !hasMore || !enabled) return;

    try {
      setIsLoading(true);
      await onLoadMore();
    } catch (error) {
      console.error('Failed to load more:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, enabled, onLoadMore]);

  // Set up intersection observer
  React.useEffect(() => {
    if (!enabled || !hasMore) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && !isLoading) {
          loadMore();
        }
      },
      {
        rootMargin: `${threshold}px`,
      }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [enabled, hasMore, isLoading, threshold, loadMore]);

  return {
    isLoading,
    sentinelRef,
  };
}

// Infinite scroll sentinel component
export function InfiniteScrollSentinel({
  onLoadMore,
  hasMore,
  isLoading,
}: {
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
  isLoading: boolean;
}) {
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore,
    hasMore,
    enabled: !isLoading,
  });

  if (!hasMore) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-gray-400">
        <p className="text-sm">No more items to load</p>
      </div>
    );
  }

  return (
    <div ref={sentinelRef} className="py-8">
      {isLoading && (
        <div className="flex justify-center">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm">Loading more...</span>
          </div>
        </div>
      )}
    </div>
  );
}
