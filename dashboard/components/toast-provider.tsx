/**
 * Toast Notification Provider (CF-WC-084)
 *
 * Global toast notification system using react-hot-toast.
 */

'use client';

import * as React from 'react';
import { Toaster, toast as hotToast } from 'react-hot-toast';

// Re-export toast functions with custom styling
export const toast = {
  success: (message: string, options?: any) => {
    return hotToast.success(message, {
      duration: 4000,
      position: 'top-right',
      style: {
        background: '#10b981',
        color: '#fff',
      },
      iconTheme: {
        primary: '#fff',
        secondary: '#10b981',
      },
      ...options,
    });
  },

  error: (message: string, options?: any) => {
    return hotToast.error(message, {
      duration: 5000,
      position: 'top-right',
      style: {
        background: '#ef4444',
        color: '#fff',
      },
      iconTheme: {
        primary: '#fff',
        secondary: '#ef4444',
      },
      ...options,
    });
  },

  loading: (message: string, options?: any) => {
    return hotToast.loading(message, {
      position: 'top-right',
      ...options,
    });
  },

  info: (message: string, options?: any) => {
    return hotToast(message, {
      duration: 4000,
      position: 'top-right',
      icon: 'ℹ️',
      style: {
        background: '#3b82f6',
        color: '#fff',
      },
      ...options,
    });
  },

  warning: (message: string, options?: any) => {
    return hotToast(message, {
      duration: 4500,
      position: 'top-right',
      icon: '⚠️',
      style: {
        background: '#f59e0b',
        color: '#fff',
      },
      ...options,
    });
  },

  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: any) => string);
    },
    options?: any
  ) => {
    return hotToast.promise(
      promise,
      messages,
      {
        position: 'top-right',
        ...options,
      }
    );
  },

  dismiss: (toastId?: string) => {
    hotToast.dismiss(toastId);
  },

  custom: (message: React.ReactElement | string | null, options?: any) => {
    return hotToast.custom(message, {
      position: 'top-right',
      ...options,
    });
  },
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        reverseOrder={false}
        gutter={8}
        toastOptions={{
          // Default options
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          // Success
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          // Error
          error: {
            duration: 5000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </>
  );
}

// Example usage:
// import { toast } from '@/components/toast-provider';
//
// toast.success('Product created successfully!');
// toast.error('Failed to save changes');
// toast.loading('Generating content...');
// toast.info('New features available');
// toast.warning('You have unsaved changes');
//
// // Promise-based toasts
// toast.promise(
//   saveProduct(),
//   {
//     loading: 'Saving...',
//     success: 'Saved successfully!',
//     error: 'Failed to save',
//   }
// );
