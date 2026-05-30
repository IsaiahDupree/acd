/**
 * Notification Dropdown Component (CF-WC-096)
 *
 * Bell icon with dropdown showing notifications.
 * Supports badge count, mark as read, and action handlers.
 */

'use client';

import { useState, useRef, useEffect } from 'react';

export interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  type?: 'info' | 'success' | 'warning' | 'error';
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface NotificationDropdownProps {
  notifications: Notification[];
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onClear?: (id: string) => void;
  className?: string;
}

export function NotificationDropdown({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClear,
  className = '',
}: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const getNotificationIcon = (type?: string) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'warning':
        return '⚠';
      case 'error':
        return '✗';
      default:
        return 'ℹ';
    }
  };

  const getNotificationColor = (type?: string) => {
    switch (type) {
      case 'success':
        return 'text-green-500';
      case 'warning':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-blue-500';
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
      >
        <span className="text-2xl" aria-hidden="true">
          🔔
        </span>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Notifications
            </h3>
            {unreadCount > 0 && onMarkAllAsRead && (
              <button
                onClick={onMarkAllAsRead}
                className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <div className="text-4xl mb-2">📭</div>
                <div>No notifications</div>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`
                    p-4 border-b border-gray-100 dark:border-gray-800 last:border-b-0
                    transition-colors
                    ${
                      !notification.read
                        ? 'bg-blue-50 dark:bg-blue-900/10'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }
                  `}
                >
                  <div className="flex items-start space-x-3">
                    {/* Icon */}
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        !notification.read
                          ? 'bg-blue-100 dark:bg-blue-900/30'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}
                    >
                      <span
                        className={getNotificationColor(notification.type)}
                        aria-hidden="true"
                      >
                        {getNotificationIcon(notification.type)}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {notification.title}
                        </p>
                        {onClear && (
                          <button
                            onClick={() => onClear(notification.id)}
                            className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            aria-label="Clear notification"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500 dark:text-gray-500">
                          {formatTimestamp(notification.timestamp)}
                        </span>
                        <div className="flex items-center space-x-2">
                          {notification.action && (
                            <button
                              onClick={notification.action.onClick}
                              className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                            >
                              {notification.action.label}
                            </button>
                          )}
                          {!notification.read && onMarkAsRead && (
                            <button
                              onClick={() => onMarkAsRead(notification.id)}
                              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer (optional) */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
              <button className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Example usage with state management
export function NotificationDropdownExample() {
  const [notifications, setNotifications] = useState<Notification[]>(() => [
    {
      id: '1',
      title: 'Content Published',
      message: 'Your video "Product Demo" has been published to TikTok',
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      read: false,
      type: 'success',
    },
    {
      id: '2',
      title: 'Processing Complete',
      message: 'Video rendering finished for "Before/After"',
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      read: false,
      type: 'info',
    },
    {
      id: '3',
      title: 'Warning',
      message: 'Compliance disclosure missing on 2 content pieces',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
      read: true,
      type: 'warning',
      action: {
        label: 'Fix now',
        onClick: () => console.log('Navigate to fix'),
      },
    },
  ]);

  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClear = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <NotificationDropdown
      notifications={notifications}
      onMarkAsRead={handleMarkAsRead}
      onMarkAllAsRead={handleMarkAllAsRead}
      onClear={handleClear}
    />
  );
}
