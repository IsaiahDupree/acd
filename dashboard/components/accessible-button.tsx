/**
 * Accessible Button Component (CF-WC-071, CF-WC-072)
 *
 * Button with proper ARIA attributes and keyboard navigation support.
 */

'use client';

import * as React from 'react';
import { getAriaButtonProps, handleKeyboardClick, type AriaButtonProps } from '../lib/accessibility';

interface AccessibleButtonProps extends AriaButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function AccessibleButton({
  onClick,
  children,
  className = '',
  disabled = false,
  variant = 'primary',
  ...ariaProps
}: AccessibleButtonProps) {
  const ariaAttributes = getAriaButtonProps(ariaProps);

  const baseStyles = 'px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  const variantStyles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 disabled:bg-gray-300',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:bg-gray-300',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      {...ariaAttributes}
      onKeyDown={(e) => handleKeyboardClick(e, onClick)}
    >
      {children}
    </button>
  );
}
