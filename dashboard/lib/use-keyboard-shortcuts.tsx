/**
 * Keyboard Shortcuts Hook (CF-WC-090)
 *
 * Global keyboard shortcut system with help dialog.
 */

import * as React from 'react';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  cmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
  preventDefault?: boolean;
}

interface ShortcutGroup {
  group: string;
  shortcuts: KeyboardShortcut[];
}

export function useKeyboardShortcuts(shortcuts: ShortcutGroup[]) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Find matching shortcut
      for (const group of shortcuts) {
        for (const shortcut of group.shortcuts) {
          const metaKey = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;

          const matches =
            e.key.toLowerCase() === shortcut.key.toLowerCase() &&
            (shortcut.ctrl === undefined || e.ctrlKey === shortcut.ctrl) &&
            (shortcut.cmd === undefined || metaKey === (shortcut.cmd || false)) &&
            (shortcut.shift === undefined || e.shiftKey === shortcut.shift) &&
            (shortcut.alt === undefined || e.altKey === shortcut.alt);

          if (matches) {
            if (shortcut.preventDefault !== false) {
              e.preventDefault();
            }
            shortcut.action();
            return;
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

// Keyboard shortcuts help dialog
export function KeyboardShortcutsHelp({
  isOpen,
  onClose,
  shortcuts,
}: {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: ShortcutGroup[];
}) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMac = navigator.platform.includes('Mac');

  const formatKey = (shortcut: KeyboardShortcut): string => {
    const parts = [];

    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.cmd) parts.push(isMac ? '⌘' : 'Ctrl');
    if (shortcut.alt) parts.push(isMac ? '⌥' : 'Alt');
    if (shortcut.shift) parts.push('⇧');
    parts.push(shortcut.key.toUpperCase());

    return parts.join(' + ');
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2
                id="shortcuts-title"
                className="text-2xl font-bold text-gray-900 dark:text-white"
              >
                Keyboard Shortcuts
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close shortcuts help"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              {shortcuts.map((group) => (
                <div key={group.group}>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">
                    {group.group}
                  </h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {shortcut.description}
                        </span>
                        <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
                          {formatKey(shortcut)}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Hook for showing shortcuts help
export function useKeyboardShortcutsHelp(shortcuts: ShortcutGroup[]) {
  const [isOpen, setIsOpen] = React.useState(false);

  // Add Cmd+/ or Ctrl+/ to open help
  const shortcutsWithHelp = React.useMemo(
    () => [
      ...shortcuts,
      {
        group: 'General',
        shortcuts: [
          {
            key: '/',
            cmd: true,
            description: 'Show keyboard shortcuts',
            action: () => setIsOpen(true),
          },
        ],
      },
    ],
    [shortcuts]
  );

  useKeyboardShortcuts(shortcutsWithHelp);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    dialog: (
      <KeyboardShortcutsHelp
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        shortcuts={shortcuts}
      />
    ),
  };
}

// Example usage:
// const shortcuts = [
//   {
//     group: 'Navigation',
//     shortcuts: [
//       { key: 'h', cmd: true, description: 'Go to home', action: () => router.push('/') },
//       { key: 'd', cmd: true, description: 'Go to dossiers', action: () => router.push('/dossiers') },
//     ],
//   },
//   {
//     group: 'Actions',
//     shortcuts: [
//       { key: 'n', cmd: true, description: 'New dossier', action: () => createNew() },
//       { key: 's', cmd: true, description: 'Save', action: () => save() },
//     ],
//   },
// ];
//
// const { dialog } = useKeyboardShortcutsHelp(shortcuts);
//
// return (
//   <>
//     {/* Your content */}
//     {dialog}
//   </>
// );
