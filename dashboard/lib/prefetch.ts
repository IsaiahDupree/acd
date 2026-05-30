/**
 * Prefetch Utilities (CF-WC-058)
 *
 * Utilities for prefetching routes and data to improve navigation performance.
 */

'use client';

/**
 * Prefetch data for a given key using a loader function
 */
export async function prefetchData<T>(
  key: string,
  loader: () => Promise<T>
): Promise<T | null> {
  try {
    // Check if data is already in cache
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const cached = sessionStorage.getItem(`prefetch:${key}`);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    }

    // Load and cache the data
    const data = await loader();

    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.setItem(`prefetch:${key}`, JSON.stringify(data));
      } catch (e) {
        // Storage quota exceeded, ignore
        console.warn('Prefetch cache full:', e);
      }
    }

    return data;
  } catch (error) {
    console.error('Prefetch failed:', error);
    return null;
  }
}

/**
 * Clear prefetch cache for a specific key or all keys
 */
export function clearPrefetchCache(key?: string): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;

  if (key) {
    sessionStorage.removeItem(`prefetch:${key}`);
  } else {
    // Clear all prefetch keys
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('prefetch:')) {
        keys.push(k);
      }
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  }
}

/**
 * Prefetch multiple routes in parallel
 */
export function prefetchRoutes(routes: string[]): void {
  if (typeof window === 'undefined') return;

  routes.forEach((route) => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = route;
    document.head.appendChild(link);
  });
}

/**
 * Hook to prefetch data on component mount
 */
export function usePrefetch<T>(
  key: string,
  loader: () => Promise<T>,
  enabled = true
): void {
  if (typeof window === 'undefined' || !enabled) return;

  // Prefetch on next idle callback
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      prefetchData(key, loader);
    });
  } else {
    setTimeout(() => {
      prefetchData(key, loader);
    }, 1);
  }
}
