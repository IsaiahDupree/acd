/**
 * Responsive Data Table Component (CF-WC-092)
 *
 * Displays data in table format on desktop and card format on mobile.
 * Supports sorting, custom rendering, and accessibility.
 */

'use client';

import { useState } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  mobileLabel?: string; // Custom label for mobile view
}

export interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (item: T) => void;
}

type SortDirection = 'asc' | 'desc' | null;

export function ResponsiveTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No data available',
  className = '',
  onRowClick,
}: ResponsiveTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortKey(null);
        setSortDirection(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey || !sortDirection) return 0;

    const aVal = a[sortKey];
    const bVal = b[sortKey];

    if (aVal === bVal) return 0;

    let comparison = 0;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal);
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {column.sortable ? (
                    <button
                      onClick={() => handleSort(column.key)}
                      className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                      aria-label={`Sort by ${column.label}`}
                    >
                      <span>{column.label}</span>
                      <span className="text-gray-400">
                        {sortKey === column.key ? (
                          sortDirection === 'asc' ? (
                            <span aria-hidden="true">↑</span>
                          ) : (
                            <span aria-hidden="true">↓</span>
                          )
                        ) : (
                          <span aria-hidden="true" className="opacity-40">
                            ↕
                          </span>
                        )}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedData.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={
                  onRowClick
                    ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors'
                    : ''
                }
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
                  >
                    {column.render
                      ? column.render(row[column.key], row)
                      : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {sortedData.map((row) => (
          <div
            key={keyExtractor(row)}
            onClick={() => onRowClick?.(row)}
            className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${
              onRowClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
            }`}
          >
            {columns.map((column) => (
              <div key={column.key} className="flex justify-between py-2">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {column.mobileLabel || column.label}
                </span>
                <span className="text-sm text-gray-900 dark:text-gray-100 text-right">
                  {column.render
                    ? column.render(row[column.key], row)
                    : row[column.key]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Example status badge renderer
export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    published: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    processing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  };

  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium ${
        colors[status.toLowerCase()] || colors.draft
      }`}
    >
      {status}
    </span>
  );
}
