/**
 * Structured Data (JSON-LD) Utilities (CF-WC-064)
 *
 * Generates Schema.org structured data for SEO and rich results.
 */

export interface OrganizationSchema {
  '@context': 'https://schema.org';
  '@type': 'Organization';
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
  contactPoint?: {
    '@type': 'ContactPoint';
    telephone?: string;
    contactType: string;
    email?: string;
  };
}

export interface ProductSchema {
  '@context': 'https://schema.org';
  '@type': 'Product';
  name: string;
  description: string;
  image?: string[];
  brand?: {
    '@type': 'Brand';
    name: string;
  };
  offers?: {
    '@type': 'Offer';
    url?: string;
    priceCurrency?: string;
    price?: string;
    availability?: string;
    priceValidUntil?: string;
  };
  aggregateRating?: {
    '@type': 'AggregateRating';
    ratingValue: string;
    reviewCount: string;
  };
}

export interface BreadcrumbSchema {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: Array<{
    '@type': 'ListItem';
    position: number;
    name: string;
    item?: string;
  }>;
}

export interface WebPageSchema {
  '@context': 'https://schema.org';
  '@type': 'WebPage';
  name: string;
  description: string;
  url: string;
  publisher?: OrganizationSchema;
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentfactory.example.com';

/**
 * Generate Organization schema
 */
export function generateOrganizationSchema(
  overrides?: Partial<OrganizationSchema>
): OrganizationSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Content Factory',
    url: BASE_URL,
    logo: `${BASE_URL}/logo.png`,
    description: 'AI-powered content generation for social commerce',
    sameAs: [
      'https://twitter.com/contentfactory',
      'https://facebook.com/contentfactory',
      'https://linkedin.com/company/contentfactory',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@contentfactory.example.com',
    },
    ...overrides,
  };
}

/**
 * Generate Product schema
 */
export function generateProductSchema(product: {
  id: string;
  name: string;
  description: string;
  image?: string;
  price?: number;
  currency?: string;
  brand?: string;
  rating?: number;
  reviewCount?: number;
}): ProductSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image ? [product.image] : undefined,
    brand: product.brand
      ? {
          '@type': 'Brand',
          name: product.brand,
        }
      : undefined,
    offers: product.price
      ? {
          '@type': 'Offer',
          url: `${BASE_URL}/products/${product.id}`,
          priceCurrency: product.currency || 'USD',
          price: product.price.toString(),
          availability: 'https://schema.org/InStock',
        }
      : undefined,
    aggregateRating:
      product.rating && product.reviewCount
        ? {
            '@type': 'AggregateRating',
            ratingValue: product.rating.toString(),
            reviewCount: product.reviewCount.toString(),
          }
        : undefined,
  };
}

/**
 * Generate Breadcrumb schema
 */
export function generateBreadcrumbSchema(
  breadcrumbs: Array<{ name: string; url?: string }>
): BreadcrumbSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url ? `${BASE_URL}${crumb.url}` : undefined,
    })),
  };
}

/**
 * Generate WebPage schema
 */
export function generateWebPageSchema(page: {
  name: string;
  description: string;
  url: string;
}): WebPageSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.name,
    description: page.description,
    url: `${BASE_URL}${page.url}`,
    publisher: generateOrganizationSchema(),
  };
}

/**
 * Generate SoftwareApplication schema (for app pages)
 */
export function generateSoftwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Content Factory',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '127',
    },
  };
}

/**
 * Combine multiple schemas into one JSON-LD script
 */
export function combineSchemas(...schemas: object[]): string {
  const combined = {
    '@context': 'https://schema.org',
    '@graph': schemas,
  };
  return JSON.stringify(combined);
}
