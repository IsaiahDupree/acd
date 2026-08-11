/**
 * Command Palette Component (CF-WC-094)
 *
 * Quick search and navigation with Cmd+K shortcut.
 * Supports searching content, navigating pages, and executing actions.
 */

'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';

export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  action?: () => void;
  href?: string;
  category?: string;
  keywords?: string[];
}

export interface CommandPaletteProps {
  actions: CommandAction[];
  placeholder?: string;
  className?: string;
}

function optionId(action: CommandAction, index: number): string {
  const safeId = action.id.replace(/[^A-Za-z0-9_-]/g, '-');
  return `command-palette-option-${index}-${safeId}`;
}

export function CommandPalette({
  actions,
  placeholder = 'Search or type a command...',
  className = '',
}: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Reset transient UI state when the palette opens/closes (state adjustment
  // during render, the React-recommended alternative to setState-in-effect).
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setSelectedIndex(0);
    if (!isOpen) {
      setQuery('');
    }
  }

  // Filter actions based on query
  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions;

    const lowerQuery = query.toLowerCase();
    return actions.filter((action) => {
      const searchableText = [
        action.label,
        action.description,
        action.category,
        ...(action.keywords || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(lowerQuery);
    });
  }, [actions, query]);

  // Group actions by category
  const groupedActions = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {};

    filteredActions.forEach((action) => {
      const category = action.category || 'General';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(action);
    });

    return groups;
  }, [filteredActions]);

  const activeAction = filteredActions[selectedIndex];
  const activeOptionId = activeAction ? optionId(activeAction, selectedIndex) : undefined;

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }

      // Escape to close
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened (DOM side-effect only; state reset happens during render)
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredActions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredActions[selectedIndex]) {
        executeAction(filteredActions[selectedIndex]);
      }
    }
  };

  const executeAction = (action: CommandAction) => {
    if (action.action) {
      action.action();
    } else if (action.href) {
      router.push(action.href);
    }
    setIsOpen(false);
    setQuery('');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Command Palette */}
      <div
        className={`fixed top-1/4 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-4">
            <span className="text-gray-400 mr-3" aria-hidden="true">
              🔍
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 py-3 bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
              aria-label="Search commands"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-results"
              aria-activedescendant={activeOptionId}
            />
            <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded border border-gray-300 dark:border-gray-600">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div
            id="command-palette-results"
            className="max-h-96 overflow-y-auto p-2"
            role="listbox"
            aria-label="Commands"
          >
            {filteredActions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No results found for &quot;{query}&quot;
              </div>
            ) : (
              Object.entries(groupedActions).map(([category, categoryActions]) => (
                <div key={category} className="mb-4 last:mb-0" role="group" aria-label={category}>
                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {category}
                  </div>
                  {categoryActions.map((action) => {
                    const globalIndex = filteredActions.indexOf(action);
                    const isSelected = globalIndex === selectedIndex;

                    return (
                      <button
                        key={action.id}
                        id={optionId(action, globalIndex)}
                        role="option"
                        onClick={() => executeAction(action)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`
                          w-full flex items-center px-3 py-2 rounded text-left
                          transition-colors
                          ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/30'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                          }
                        `}
                        aria-selected={isSelected}
                      >
                        {action.icon && (
                          <span className="mr-3 text-xl" aria-hidden="true">
                            {action.icon}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {action.label}
                          </div>
                          {action.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {action.description}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center space-x-4">
              <span className="flex items-center">
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono mr-1">
                  ↑
                </kbd>
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono mr-1">
                  ↓
                </kbd>
                <span>Navigate</span>
              </span>
              <span className="flex items-center">
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono mr-1">
                  ↵
                </kbd>
                <span>Select</span>
              </span>
            </div>
            <span>
              Press{' '}
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono">
                ⌘K
              </kbd>{' '}
              to open
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// Hook to use command palette in any component
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { isOpen, setIsOpen };
}
