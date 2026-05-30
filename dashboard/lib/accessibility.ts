/**
 * Accessibility Utilities (CF-WC-071 to CF-WC-080)
 *
 * Utilities for managing accessibility features including ARIA labels,
 * keyboard navigation, focus management, and screen reader support.
 */

// CF-WC-071: ARIA labels and roles
export interface AriaButtonProps {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  describedBy?: string;
}

export function getAriaButtonProps(props: AriaButtonProps): Record<string, string | boolean> {
  const aria: Record<string, string | boolean> = {
    'aria-label': props.label,
    role: 'button',
  };

  if (props.pressed !== undefined) {
    aria['aria-pressed'] = props.pressed;
  }

  if (props.expanded !== undefined) {
    aria['aria-expanded'] = props.expanded;
  }

  if (props.controls) {
    aria['aria-controls'] = props.controls;
  }

  if (props.describedBy) {
    aria['aria-describedby'] = props.describedBy;
  }

  return aria;
}

// CF-WC-072: Keyboard navigation helpers
export const KEYBOARD_KEYS = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
} as const;

export function handleKeyboardClick(
  event: React.KeyboardEvent,
  callback: () => void
): void {
  if (event.key === KEYBOARD_KEYS.ENTER || event.key === KEYBOARD_KEYS.SPACE) {
    event.preventDefault();
    callback();
  }
}

export function handleEscape(
  event: React.KeyboardEvent,
  callback: () => void
): void {
  if (event.key === KEYBOARD_KEYS.ESCAPE) {
    event.preventDefault();
    callback();
  }
}

// CF-WC-073: Focus management
export function trapFocus(element: HTMLElement): () => void {
  const focusableElements = element.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );

  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== KEYBOARD_KEYS.TAB) return;

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable?.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable?.focus();
        e.preventDefault();
      }
    }
  };

  element.addEventListener('keydown', handleKeyDown);

  return () => {
    element.removeEventListener('keydown', handleKeyDown);
  };
}

export function focusElement(selector: string, fallbackToBody = true): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) {
    element.focus();
  } else if (fallbackToBody) {
    document.body.focus();
  }
}

export function announceToScreenReader(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', politeness);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

// CF-WC-074: Color contrast utilities
export interface ColorContrastResult {
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
  isLargeText: boolean;
}

export function calculateContrastRatio(foreground: string, background: string): number {
  const getLuminance = (hex: string): number => {
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;

    const [rs, gs, bs] = [r, g, b].map(c => {
      const sRGB = c / 255;
      return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

export function checkColorContrast(
  foreground: string,
  background: string,
  isLargeText = false
): ColorContrastResult {
  const ratio = calculateContrastRatio(foreground, background);

  return {
    ratio,
    passesAA: isLargeText ? ratio >= 3 : ratio >= 4.5,
    passesAAA: isLargeText ? ratio >= 4.5 : ratio >= 7,
    isLargeText,
  };
}

// CF-WC-075: Screen reader utilities
export function hideFromScreenReader(element: HTMLElement): void {
  element.setAttribute('aria-hidden', 'true');
}

export function showToScreenReader(element: HTMLElement): void {
  element.removeAttribute('aria-hidden');
}

export function setScreenReaderText(element: HTMLElement, text: string): void {
  element.setAttribute('aria-label', text);
}

// CF-WC-078: Reduced motion support
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useReducedMotion(): boolean {
  // Hooks must run unconditionally; SSR is handled inside (lazy init + client-only effect).
  const [reducedMotion, setReducedMotion] = React.useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReducedMotion(mediaQuery.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return reducedMotion;
}

// CF-WC-079: High contrast mode support
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(prefers-contrast: high)').matches ||
    window.matchMedia('(-ms-high-contrast: active)').matches
  );
}

// CF-WC-080: Accessible table helpers
export interface TableAriaProps {
  label: string;
  describedBy?: string;
  colCount?: number;
  rowCount?: number;
}

export function getTableAriaProps(props: TableAriaProps): Record<string, string | number> {
  const aria: Record<string, string | number> = {
    'role': 'table',
    'aria-label': props.label,
  };

  if (props.describedBy) {
    aria['aria-describedby'] = props.describedBy;
  }

  if (props.colCount) {
    aria['aria-colcount'] = props.colCount;
  }

  if (props.rowCount) {
    aria['aria-rowcount'] = props.rowCount;
  }

  return aria;
}

export function getCellAriaProps(
  isHeader: boolean,
  scope?: 'row' | 'col' | 'rowgroup' | 'colgroup'
): Record<string, string> {
  if (isHeader) {
    return {
      role: 'columnheader',
      ...(scope && { scope }),
    };
  }
  return {
    role: 'cell',
  };
}

// React import for hooks
import * as React from 'react';
