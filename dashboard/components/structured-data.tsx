/**
 * Structured Data Component (CF-WC-064)
 *
 * Component to inject JSON-LD structured data into pages.
 */

import Script from 'next/script';

interface StructuredDataProps {
  data: object | object[];
}

export function StructuredData({ data }: StructuredDataProps) {
  const jsonLd = Array.isArray(data)
    ? {
        '@context': 'https://schema.org',
        '@graph': data,
      }
    : data;

  return (
    <Script
      id="structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
