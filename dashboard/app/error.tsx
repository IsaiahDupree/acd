/**
 * Error Page (CF-WC-067)
 *
 * Custom error boundary with proper SEO.
 */

'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to error reporting service
    console.error('Application error:', error);

    // Set no-index meta tag
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);

    return () => {
      document.head.removeChild(meta);
    };
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="text-center max-w-2xl">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Something went wrong
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          We encountered an unexpected error. Please try again or contact support if the problem persists.
        </p>

        <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm font-mono text-red-800 dark:text-red-200">
            {error.message}
          </p>
          {error.digest && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
