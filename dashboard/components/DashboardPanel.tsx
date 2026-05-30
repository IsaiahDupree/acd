'use client';

import { ReactNode } from 'react';

interface DashboardPanelProps {
  title?: string;
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  className?: string;
  noPad?: boolean;
}

export function DashboardPanel({
  title,
  children,
  loading = false,
  error = null,
  lastUpdated,
  onRefresh,
  className = '',
  noPad = false,
}: DashboardPanelProps) {
  return (
    <div className={`bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/60 ${className}`}>
      {(title || onRefresh) && (
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-700/40">
          {title && <h3 className="text-base font-semibold text-gray-100">{title}</h3>}
          <div className="flex items-center gap-3 ml-auto">
            {lastUpdated && (
              <span className="text-xs text-gray-500">
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-700/50"
                title="Refresh"
              >
                ↻
              </button>
            )}
          </div>
        </div>
      )}

      <div className={noPad ? '' : 'p-5'}>
        {loading && !error && (
          <div className="flex items-center justify-center py-8 text-gray-500 text-sm animate-pulse">
            Loading…
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-950/40 border border-red-800/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {!loading && !error && children}
      </div>
    </div>
  );
}
