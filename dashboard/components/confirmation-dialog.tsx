/**
 * Confirmation Dialog Component (CF-WC-085)
 *
 * Modal dialog for confirming destructive actions.
 */

'use client';

import * as React from 'react';
import { handleKeyboardClick, handleEscape, trapFocus } from '../lib/accessibility';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmationDialogProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Trap focus within dialog
  React.useEffect(() => {
    if (isOpen && dialogRef.current) {
      const cleanup = trapFocus(dialogRef.current);

      // Focus first button
      const firstButton = dialogRef.current.querySelector<HTMLElement>('button');
      firstButton?.focus();

      return cleanup;
    }
  }, [isOpen]);

  // Handle Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  const handleConfirm = async () => {
    await onConfirm();
    if (!loading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'text-red-600 dark:text-red-400',
      iconBg: 'bg-red-100 dark:bg-red-900',
      button: 'bg-red-600 hover:bg-red-700 text-white',
    },
    warning: {
      icon: 'text-yellow-600 dark:text-yellow-400',
      iconBg: 'bg-yellow-100 dark:bg-yellow-900',
      button: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    },
    info: {
      icon: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-100 dark:bg-blue-900',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  };

  const styles = variantStyles[variant];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={() => !loading && onClose()}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Icon */}
          <div className={`flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full ${styles.iconBg}`}>
            <svg
              className={`w-6 h-6 ${styles.icon}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              {variant === 'danger' && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              )}
              {variant === 'warning' && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              )}
              {variant === 'info' && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              )}
            </svg>
          </div>

          {/* Title */}
          <h3
            id="dialog-title"
            className="text-lg font-semibold text-center text-gray-900 dark:text-white mb-2"
          >
            {title}
          </h3>

          {/* Message */}
          <p
            id="dialog-description"
            className="text-sm text-center text-gray-600 dark:text-gray-400 mb-6"
          >
            {message}
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={cancelLabel}
            >
              {cancelLabel}
            </button>

            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${styles.button}`}
              aria-label={confirmLabel}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </span>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Hook for managing confirmation dialogs
export function useConfirmation() {
  const [state, setState] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'danger',
    onConfirm: () => {},
  });

  const [loading, setLoading] = React.useState(false);

  const confirm = React.useCallback(
    (options: {
      title: string;
      message: string;
      variant?: 'danger' | 'warning' | 'info';
    }): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          isOpen: true,
          title: options.title,
          message: options.message,
          variant: options.variant || 'danger',
          onConfirm: async () => {
            setLoading(true);
            await Promise.resolve();
            setLoading(false);
            setState((s) => ({ ...s, isOpen: false }));
            resolve(true);
          },
        });

        // Auto-resolve to false if dialog is closed without confirming
        const checkClosed = setInterval(() => {
          setState((s) => {
            if (!s.isOpen) {
              clearInterval(checkClosed);
              resolve(false);
            }
            return s;
          });
        }, 100);
      });
    },
    []
  );

  const close = React.useCallback(() => {
    if (!loading) {
      setState((s) => ({ ...s, isOpen: false }));
    }
  }, [loading]);

  return {
    confirm,
    close,
    dialogProps: {
      isOpen: state.isOpen,
      onClose: close,
      onConfirm: state.onConfirm,
      title: state.title,
      message: state.message,
      variant: state.variant,
      loading,
    },
  };
}

// Example usage:
// const { confirm, dialogProps } = useConfirmation();
//
// const handleDelete = async () => {
//   const confirmed = await confirm({
//     title: 'Delete Product',
//     message: 'Are you sure you want to delete this product? This action cannot be undone.',
//     variant: 'danger',
//   });
//
//   if (confirmed) {
//     await deleteProduct();
//   }
// };
//
// return (
//   <>
//     <button onClick={handleDelete}>Delete</button>
//     <ConfirmationDialog {...dialogProps} />
//   </>
// );
