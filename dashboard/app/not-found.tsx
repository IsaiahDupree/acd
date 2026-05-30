/**
 * 404 Not Found Page (CF-WC-067)
 *
 * Custom 404 page with proper SEO (no-index, 404 status).
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '404 - Page Not Found',
  description: 'The page you are looking for does not exist.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-900 dark:text-white">404</h1>
        <p className="text-2xl font-semibold text-gray-700 dark:text-gray-300 mt-4">
          Page Not Found
        </p>
        <p className="text-gray-600 dark:text-gray-400 mt-2 max-w-md mx-auto">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. The page may have been moved or deleted.
        </p>

        <div className="mt-8 flex gap-4 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Home
          </Link>
          <Link
            href="/schema-docs"
            className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Docs
          </Link>
        </div>

        <div className="mt-12 text-sm text-gray-500 dark:text-gray-400">
          <p>If you believe this is an error, please contact support.</p>
        </div>
      </div>
    </div>
  );
}
