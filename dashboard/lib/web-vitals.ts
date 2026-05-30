/**
 * Web Vitals Monitoring (CF-WC-059)
 *
 * Tracks Core Web Vitals (LCP, FID/INP, CLS, TTFB) and reports them.
 */

'use client';

export interface WebVitalMetric {
  id: string;
  name: 'CLS' | 'FCP' | 'LCP' | 'TTFB' | 'INP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache' | 'prerender' | 'restore';
}

/**
 * Thresholds for Core Web Vitals (based on web.dev recommendations)
 */
const VITALS_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
  FCP: { good: 1800, poor: 3000 },
};

/**
 * Get rating for a metric
 */
function getRating(
  name: WebVitalMetric['name'],
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const threshold = VITALS_THRESHOLDS[name];
  if (!threshold) return 'good';

  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Report metric to analytics endpoint
 */
async function reportMetric(metric: WebVitalMetric): Promise<void> {
  const body = JSON.stringify({
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    timestamp: Date.now(),
    url: window.location.href,
    userAgent: navigator.userAgent,
  });

  // Send to analytics endpoint
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/web-vitals', body);
  } else {
    fetch('/api/analytics/web-vitals', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(console.error);
  }

  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Web Vitals]', metric.name, {
      value: metric.value,
      rating: metric.rating,
    });
  }
}

/**
 * Initialize web vitals monitoring using the web-vitals library
 */
export function initWebVitals(): void {
  if (typeof window === 'undefined') return;

  // Dynamic import of web-vitals library
  import('web-vitals').then(({ onCLS, onLCP, onTTFB, onFCP, onINP }) => {
    onCLS((metric) => {
      const vitalMetric: WebVitalMetric = {
        ...metric,
        rating: getRating('CLS', metric.value),
      };
      reportMetric(vitalMetric);
    });

    onLCP((metric) => {
      const vitalMetric: WebVitalMetric = {
        ...metric,
        rating: getRating('LCP', metric.value),
      };
      reportMetric(vitalMetric);
    });

    onTTFB((metric) => {
      const vitalMetric: WebVitalMetric = {
        ...metric,
        rating: getRating('TTFB', metric.value),
      };
      reportMetric(vitalMetric);
    });

    onFCP((metric) => {
      const vitalMetric: WebVitalMetric = {
        ...metric,
        rating: getRating('FCP', metric.value),
      };
      reportMetric(vitalMetric);
    });

    onINP((metric) => {
      const vitalMetric: WebVitalMetric = {
        ...metric,
        rating: getRating('INP', metric.value),
      };
      reportMetric(vitalMetric);
    });
  });
}

/**
 * Get stored web vitals from sessionStorage
 */
export function getStoredVitals(): WebVitalMetric[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = sessionStorage.getItem('web-vitals');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Store web vital in sessionStorage for the dashboard
 */
export function storeVital(metric: WebVitalMetric): void {
  if (typeof window === 'undefined') return;

  try {
    const stored = getStoredVitals();
    stored.push(metric);
    // Keep only last 50 metrics
    const limited = stored.slice(-50);
    sessionStorage.setItem('web-vitals', JSON.stringify(limited));
  } catch (e) {
    console.error('Failed to store web vital:', e);
  }
}
