/**
 * Bulk Action Toolbar Component (CF-WC-099)
 *
 * Multi-select toolbar with batch actions.
 * Appears when items are selected, shows count, and provides action buttons.
 */

'use client';

import { ReactNode, useState } from 'react';

export interface BulkAction {
  id: string;
  label: string;
  icon?: string;
  variant?: 'default' | 'primary' | 'danger';
  onClick: (selectedIds: string[]) => void;
  confirm?: {
    title: string;
    message: string;
  };
}

export interface BulkActionToolbarProps {
  selectedIds: string[];
  totalCount: number;
  actions: BulkAction[];
  onClearSelection: () => void;
  className?: string;
}

export function BulkActionToolbar({
  selectedIds,
  totalCount,
  actions,
  onClearSelection,
  className = '',
}: BulkActionToolbarProps) {
  const selectedCount = selectedIds.length;
  const isAllSelected = selectedCount === totalCount;

  if (selectedCount === 0) return null;

  const getActionButtonClass = (variant?: string) => {
    switch (variant) {
      case 'primary':
        return 'bg-blue-500 hover:bg-blue-600 text-white';
      case 'danger':
        return 'bg-red-500 hover:bg-red-600 text-white';
      default:
        return 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300';
    }
  };

  const handleActionClick = (action: BulkAction) => {
    if (action.confirm) {
      const confirmed = window.confirm(
        `${action.confirm.title}\n\n${action.confirm.message}`
      );
      if (!confirmed) return;
    }

    action.onClick(selectedIds);
  };

  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:max-w-4xl
        bg-white dark:bg-gray-900 border-t md:border md:rounded-lg
        border-gray-200 dark:border-gray-700 shadow-lg z-40
        transition-all duration-200 ease-out
        ${className}
      `}
      role="toolbar"
      aria-label="Bulk actions toolbar"
    >
      <div className="flex items-center justify-between p-4">
        {/* Selection Info */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onClearSelection}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            aria-label="Clear selection"
          >
            <span className="text-gray-500 dark:text-gray-400 text-xl">×</span>
          </button>

          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
              <span className="text-white text-sm">✓</span>
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
            </span>
            {isAllSelected && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                (all)
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              className={`
                px-4 py-2 rounded font-medium text-sm
                transition-colors flex items-center space-x-2
                ${getActionButtonClass(action.variant)}
              `}
              aria-label={action.label}
            >
              {action.icon && (
                <span aria-hidden="true">{action.icon}</span>
              )}
              <span className="hidden sm:inline">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Selectable Table Row Component
export interface SelectableRowProps {
  id: string;
  isSelected: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
  className?: string;
}

export function SelectableRow({
  id,
  isSelected,
  onToggle,
  children,
  className = '',
}: SelectableRowProps) {
  return (
    <div
      className={`
        flex items-center space-x-3 p-3 border-b border-gray-200 dark:border-gray-700
        transition-colors
        ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
        ${className}
      `}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(id)}
        className="w-4 h-4 text-blue-500 rounded border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
        aria-label={`Select item ${id}`}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}

// Example usage with state management
export function BulkActionExample() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const items = [
    { id: '1', name: 'Product Demo Video', status: 'published' },
    { id: '2', name: 'Before/After Showcase', status: 'processing' },
    { id: '3', name: 'Testimonial Reel', status: 'draft' },
    { id: '4', name: 'Feature Highlight', status: 'published' },
    { id: '5', name: 'Tutorial Series', status: 'draft' },
  ];

  const actions: BulkAction[] = [
    {
      id: 'publish',
      label: 'Publish',
      icon: '🚀',
      variant: 'primary',
      onClick: (ids) => {
        console.log('Publishing:', ids);
        setSelectedIds([]);
      },
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: '📦',
      onClick: (ids) => {
        console.log('Archiving:', ids);
        setSelectedIds([]);
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: '🗑',
      variant: 'danger',
      confirm: {
        title: 'Delete Items',
        message: `Are you sure you want to delete ${selectedIds.length} item(s)?`,
      },
      onClick: (ids) => {
        console.log('Deleting:', ids);
        setSelectedIds([]);
      },
    },
  ];

  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleToggleAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((item) => item.id));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Content Library</h3>
        <button
          onClick={handleToggleAll}
          className="text-sm text-blue-500 hover:text-blue-600"
        >
          {selectedIds.length === items.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {items.map((item) => (
          <SelectableRow
            key={item.id}
            id={item.id}
            isSelected={selectedIds.includes(item.id)}
            onToggle={handleToggle}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {item.name}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Status: {item.status}
                </div>
              </div>
            </div>
          </SelectableRow>
        ))}
      </div>

      <BulkActionToolbar
        selectedIds={selectedIds}
        totalCount={items.length}
        actions={actions}
        onClearSelection={() => setSelectedIds([])}
      />
    </div>
  );
}
