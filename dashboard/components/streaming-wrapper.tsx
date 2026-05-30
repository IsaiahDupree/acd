/**
 * Streaming Wrapper Component (CF-WC-060)
 *
 * Provides Suspense boundaries for streaming SSR and progressive rendering.
 */

import { Suspense, ReactNode } from 'react';

interface StreamingWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
  priority?: 'high' | 'medium' | 'low';
}

/**
 * Default loading skeleton
 */
function DefaultSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
    </div>
  );
}

/**
 * Wrapper component that enables streaming SSR with Suspense
 */
export function StreamingWrapper({
  children,
  fallback = <DefaultSkeleton />,
  priority = 'medium',
}: StreamingWrapperProps) {
  return (
    <Suspense fallback={fallback}>
      <div data-streaming-priority={priority}>{children}</div>
    </Suspense>
  );
}

/**
 * Loading skeleton for cards
 */
export function CardSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for table rows
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded flex-1"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded flex-1"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded flex-1"></div>
        </div>
      ))}
    </div>
  );
}

/**
 * Loading skeleton for list items
 */
export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </div>
      ))}
    </div>
  );
}
