/**
 * Empty State Component (CF-WC-082)
 *
 * Displays helpful empty states for lists and collections.
 */

'use client';

import * as React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-12 text-center ${className}`}
      role="status"
      aria-label={title}
    >
      {icon && (
        <div className="mb-4 text-gray-400 dark:text-gray-600" aria-hidden="true">
          {icon}
        </div>
      )}

      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-md">
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label={action.label}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Preset empty states
export function EmptyDossiers({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      }
      title="No product dossiers yet"
      description="Create your first product dossier to start generating content"
      action={onCreate ? { label: 'Create Dossier', onClick: onCreate } : undefined}
    />
  );
}

export function EmptyScripts({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      }
      title="No scripts generated"
      description="Generate scripts across the 5 awareness levels for your products"
      action={onCreate ? { label: 'Generate Scripts', onClick: onCreate } : undefined}
    />
  );
}

export function EmptyContent({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      }
      title="No content pieces yet"
      description="Start creating videos, images, and social media content"
      action={onCreate ? { label: 'Create Content', onClick: onCreate } : undefined}
    />
  );
}

export function EmptySearch({ query }: { query: string }) {
  return (
    <EmptyState
      icon={
        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      }
      title="No results found"
      description={`We couldn't find anything matching "${query}". Try different keywords.`}
    />
  );
}

export function EmptyFilter() {
  return (
    <EmptyState
      icon={
        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
      }
      title="No items match your filters"
      description="Try adjusting or clearing your filters to see more results"
    />
  );
}
