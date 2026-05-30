/**
 * Error Boundary Component (CF-WC-083)
 *
 * Global error boundary with recovery options.
 */

'use client';

import * as React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // Report to error monitoring service
    if (typeof window !== 'undefined' && (window as any).reportError) {
      (window as any).reportError({
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          reset={this.reset}
        />
      );
    }

    return this.props.children;
  }
}

function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900 rounded-full">
          <svg
            className="w-8 h-8 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">
          Something went wrong
        </h2>

        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
          We encountered an unexpected error. You can try again or contact support if the problem persists.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <details className="mb-6 p-4 bg-gray-100 dark:bg-gray-700 rounded text-sm">
            <summary className="cursor-pointer font-medium text-gray-900 dark:text-white mb-2">
              Error details
            </summary>
            <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-auto">
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
          </details>
        )}

        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Try again"
          >
            Try Again
          </button>

          <button
            onClick={() => window.location.href = '/'}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            aria-label="Go to homepage"
          >
            Go Home
          </button>
        </div>

        <button
          onClick={() => {
            const email = 'support@contentfactory.com';
            const subject = 'Error Report';
            const body = `Error: ${error.message}\n\nStack: ${error.stack}`;
            window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          }}
          className="w-full mt-3 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          aria-label="Report this error"
        >
          Report this error
        </button>
      </div>
    </div>
  );
}

// Route-level error boundary
export function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div className="p-6">
          <div className="max-w-2xl mx-auto bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
              Error loading this page
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">
              {error.message}
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
