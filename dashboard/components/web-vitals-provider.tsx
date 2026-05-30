/**
 * Web Vitals Provider (CF-WC-059)
 *
 * Client component that initializes web vitals monitoring on page load.
 */

'use client';

import { useEffect } from 'react';
import { initWebVitals } from '../lib/web-vitals';

export function WebVitalsProvider() {
  useEffect(() => {
    initWebVitals();
  }, []);

  return null;
}
