/**
 * Breadcrumbs Component (CF-WC-068)
 *
 * Visual breadcrumb navigation with structured data support.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { StructuredData } from './structured-data';
import { generateBreadcrumbSchema } from '../lib/structured-data';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  className?: string;
}

/**
 * Generate breadcrumbs from pathname
 */
function generateBreadcrumbsFromPath(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/' }];

  segments.forEach((segment, index) => {
    const path = '/' + segments.slice(0, index + 1).join('/');
    const label = segment
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    breadcrumbs.push({
      label,
      href: index < segments.length - 1 ? path : undefined, // Last item has no link
    });
  });

  return breadcrumbs;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  const pathname = usePathname();
  const breadcrumbs = items || generateBreadcrumbsFromPath(pathname);

  // Generate structured data
  const structuredData = generateBreadcrumbSchema(
    breadcrumbs.map((item) => ({
      name: item.label,
      url: item.href,
    }))
  );

  return (
    <>
      <StructuredData data={structuredData} />
      <nav aria-label="Breadcrumb" className={className}>
        <ol className="flex items-center space-x-2 text-sm">
          {breadcrumbs.map((item, index) => (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <span className="mx-2 text-gray-400 dark:text-gray-600">/</span>
              )}
              {item.href ? (
                <Link
                  href={item.href}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="text-gray-900 dark:text-white font-medium"
                  aria-current="page"
                >
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}

/**
 * Compact breadcrumbs for mobile
 */
export function CompactBreadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  const pathname = usePathname();
  const breadcrumbs = items || generateBreadcrumbsFromPath(pathname);

  if (breadcrumbs.length <= 1) return null;

  const previous = breadcrumbs[breadcrumbs.length - 2];
  const current = breadcrumbs[breadcrumbs.length - 1];

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center space-x-2 text-sm">
        {previous.href && (
          <li>
            <Link
              href={previous.href}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center"
            >
              <span className="mr-2">←</span>
              {previous.label}
            </Link>
          </li>
        )}
        <li>
          <span className="mx-2 text-gray-400 dark:text-gray-600">/</span>
        </li>
        <li>
          <span
            className="text-gray-900 dark:text-white font-medium"
            aria-current="page"
          >
            {current.label}
          </span>
        </li>
      </ol>
    </nav>
  );
}
