/**
 * Form Autosave Hook (CF-WC-088)
 *
 * Auto-save form progress with draft restoration.
 */

import * as React from 'react';

interface AutosaveOptions<T> {
  key: string;
  data: T;
  onSave?: (data: T) => Promise<void>;
  interval?: number; // ms
  enabled?: boolean;
}

interface AutosaveState {
  lastSaved: Date | null;
  isSaving: boolean;
  error: Error | null;
}

export function useAutosave<T>({
  key,
  data,
  onSave,
  interval = 3000, // 3 seconds
  enabled = true,
}: AutosaveOptions<T>) {
  const [state, setState] = React.useState<AutosaveState>({
    lastSaved: null,
    isSaving: false,
    error: null,
  });

  const dataRef = React.useRef(data);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Update ref when data changes
  React.useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Save function
  const save = React.useCallback(async () => {
    if (!enabled) return;

    try {
      setState((s) => ({ ...s, isSaving: true, error: null }));

      // Save to localStorage
      localStorage.setItem(`autosave:${key}`, JSON.stringify(dataRef.current));

      // Call optional save handler
      if (onSave) {
        await onSave(dataRef.current);
      }

      setState({
        lastSaved: new Date(),
        isSaving: false,
        error: null,
      });
    } catch (error) {
      setState((s) => ({
        ...s,
        isSaving: false,
        error: error as Error,
      }));
    }
  }, [key, onSave, enabled]);

  // Auto-save on interval
  React.useEffect(() => {
    if (!enabled) return;

    const startTimer = () => {
      timerRef.current = setTimeout(() => {
        save();
        startTimer();
      }, interval);
    };

    startTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [save, interval, enabled]);

  // Restore draft from localStorage
  const restore = React.useCallback((): T | null => {
    try {
      const stored = localStorage.getItem(`autosave:${key}`);
      if (stored) {
        return JSON.parse(stored) as T;
      }
    } catch (error) {
      console.error('Failed to restore autosave:', error);
    }
    return null;
  }, [key]);

  // Clear saved draft
  const clear = React.useCallback(() => {
    localStorage.removeItem(`autosave:${key}`);
    setState({
      lastSaved: null,
      isSaving: false,
      error: null,
    });
  }, [key]);

  // Manual save
  const saveNow = React.useCallback(() => {
    return save();
  }, [save]);

  return {
    ...state,
    save: saveNow,
    restore,
    clear,
  };
}

// Status indicator component
export function AutosaveIndicator({ state }: { state: AutosaveState }) {
  if (state.isSaving) {
    return (
      <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Saving...
      </span>
    );
  }

  if (state.error) {
    return (
      <span className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Save failed
      </span>
    );
  }

  if (state.lastSaved) {
    const timeAgo = getTimeAgo(state.lastSaved);
    return (
      <span className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Saved {timeAgo}
      </span>
    );
  }

  return null;
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
