/**
 * Web Vitals Dashboard (CF-WC-059)
 *
 * Displays Core Web Vitals metrics in real-time.
 */

'use client';

import { useState, useEffect } from 'react';
import { getStoredVitals, WebVitalMetric } from '../lib/web-vitals';

export function WebVitalsDashboard() {
  const [vitals, setVitals] = useState<WebVitalMetric[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Update vitals every 2 seconds
    const interval = setInterval(() => {
      setVitals(getStoredVitals());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Get latest value for each metric
  const latestMetrics = vitals.reduce(
    (acc, vital) => {
      if (!acc[vital.name] || vital.id > acc[vital.name].id) {
        acc[vital.name] = vital;
      }
      return acc;
    },
    {} as Record<string, WebVitalMetric>
  );

  const metrics = Object.values(latestMetrics);

  if (process.env.NODE_ENV !== 'development' && !isOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-gray-800 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Web Vitals
          </span>
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 w-80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Core Web Vitals
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>

          {metrics.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No metrics collected yet...
            </p>
          ) : (
            <div className="space-y-3">
              {metrics.map((metric) => (
                <div key={metric.name} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {metric.name}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        metric.rating === 'good'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          : metric.rating === 'needs-improvement'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                      }`}
                    >
                      {metric.rating}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatValue(metric.name, metric.value)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Metrics are collected on this page and reported to analytics.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(metric: string, value: number): string {
  if (metric === 'CLS') {
    return value.toFixed(3);
  }
  return Math.round(value) + 'ms';
}
