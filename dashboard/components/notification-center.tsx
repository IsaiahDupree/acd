/**
 * In-App Notification Center (CF-WC-121)
 *
 * Centralized notification center for in-app messages and alerts.
 */

'use client';

import { useCallback, useState, useEffect } from 'react';

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  category: 'content' | 'system' | 'account' | 'billing';
}

export interface NotificationCenterProps {
  userId: string;
  onNotificationClick?: (notification: AppNotification) => void;
}

export function NotificationCenter({ userId, onNotificationClick }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | string>('all');
  const [isLoading, setIsLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch notifications from API
      // const response = await fetch(`/api/notifications?userId=${userId}`);
      // const data = await response.json();

      // Mock data for now
      const mockNotifications: AppNotification[] = [
        {
          id: '1',
          type: 'success',
          title: 'Content Published',
          message: 'Your video "Product Demo" was successfully published to TikTok',
          timestamp: new Date(Date.now() - 1000 * 60 * 15),
          read: false,
          category: 'content',
          actionUrl: '/content/123',
          actionLabel: 'View Content',
        },
        {
          id: '2',
          type: 'info',
          title: 'Processing Complete',
          message: 'Video rendering finished for "Before/After Showcase"',
          timestamp: new Date(Date.now() - 1000 * 60 * 60),
          read: false,
          category: 'content',
        },
        {
          id: '3',
          type: 'warning',
          title: 'Action Required',
          message: 'Please verify your email address to enable publishing',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3),
          read: true,
          category: 'account',
          actionUrl: '/settings/email',
          actionLabel: 'Verify Now',
        },
      ];

      setNotifications(mockNotifications);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-load: fetch notifications on mount/userId change
    loadNotifications();
  }, [loadNotifications]);

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );

    // Update on server
    // await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    // Update on server
    // await fetch(`/api/notifications/read-all`, { method: 'POST' });
  };

  const deleteNotification = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));

    // Delete on server
    // await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    return n.category === filter;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return 'ℹ️';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default:
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
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
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 px-2 py-1 text-xs bg-blue-500 text-white rounded-full">
                {unreadCount}
              </span>
            )}
          </h2>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2 overflow-x-auto">
          {['all', 'unread', 'content', 'system', 'account', 'billing'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            Loading notifications...
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-2">🔔</div>
            <div>No notifications</div>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`
                border-b border-gray-100 dark:border-gray-800 last:border-b-0
                ${!notification.read ? 'bg-blue-50 dark:bg-blue-900/10' : ''}
              `}
            >
              <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-start space-x-3">
                  {/* Icon */}
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getTypeColor(
                      notification.type
                    )} border`}
                  >
                    <span className="text-xl" aria-hidden="true">
                      {getTypeIcon(notification.type)}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {notification.title}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {notification.message}
                        </p>
                      </div>

                      <button
                        onClick={() => deleteNotification(notification.id)}
                        className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        aria-label="Delete notification"
                      >
                        ×
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500 dark:text-gray-500">
                        {formatTimestamp(notification.timestamp)}
                      </span>

                      <div className="flex items-center space-x-2">
                        {notification.actionUrl && (
                          <button
                            onClick={() => {
                              markAsRead(notification.id);
                              onNotificationClick?.(notification);
                            }}
                            className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                          >
                            {notification.actionLabel || 'View'}
                          </button>
                        )}
                        {!notification.read && (
                          <button
                            onClick={() => markAsRead(notification.id)}
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}
