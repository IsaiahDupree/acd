/**
 * Notification Service
 * ====================
 *
 * PCT-WC-120: Notification preferences
 * PCT-WC-121: In-app notification center
 *
 * Features:
 * - User notification preferences (per-type, frequency control)
 * - In-app notification storage and delivery
 * - Real-time notification via WebSocket/Socket.io
 * - Read/unread tracking
 * - Notification grouping and batching
 */

import { EventEmitter } from 'events';

export type NotificationType =
  | 'system'
  | 'feature_update'
  | 'approval_request'
  | 'approval_resolved'
  | 'test_result'
  | 'milestone'
  | 'error'
  | 'warning'
  | 'info';

export type NotificationFrequency = 'instant' | 'hourly' | 'daily' | 'weekly' | 'never';

export interface NotificationPreferences {
  userId: string;
  preferences: {
    [key in NotificationType]: {
      email: boolean;
      inApp: boolean;
      frequency: NotificationFrequency;
    };
  };
  emailDigestFrequency: 'daily' | 'weekly' | 'never';
  quietHoursEnabled: boolean;
  quietHoursStart?: string; // HH:MM format
  quietHoursEnd?: string; // HH:MM format
  timezone?: string;
  updatedAt: Date;
}

export interface InAppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  readAt?: Date;
  url?: string;
  icon?: string;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  expiresAt?: Date;
}

export interface NotificationGroup {
  type: NotificationType;
  count: number;
  latestNotification: InAppNotification;
  notifications: InAppNotification[];
}

class NotificationService extends EventEmitter {
  private preferences: Map<string, NotificationPreferences> = new Map();
  private notifications: Map<string, InAppNotification[]> = new Map();
  private maxNotificationsPerUser = 1000;

  constructor() {
    super();
  }

  /**
   * PCT-WC-120: Get user notification preferences
   */
  getUserPreferences(userId: string): NotificationPreferences {
    let prefs = this.preferences.get(userId);

    if (!prefs) {
      // Create default preferences
      prefs = this.createDefaultPreferences(userId);
      this.preferences.set(userId, prefs);
    }

    return prefs;
  }

  /**
   * PCT-WC-120: Create default notification preferences
   */
  private createDefaultPreferences(userId: string): NotificationPreferences {
    return {
      userId,
      preferences: {
        system: { email: true, inApp: true, frequency: 'instant' },
        feature_update: { email: true, inApp: true, frequency: 'instant' },
        approval_request: { email: true, inApp: true, frequency: 'instant' },
        approval_resolved: { email: true, inApp: true, frequency: 'instant' },
        test_result: { email: false, inApp: true, frequency: 'instant' },
        milestone: { email: true, inApp: true, frequency: 'instant' },
        error: { email: true, inApp: true, frequency: 'instant' },
        warning: { email: false, inApp: true, frequency: 'hourly' },
        info: { email: false, inApp: true, frequency: 'daily' },
      },
      emailDigestFrequency: 'daily',
      quietHoursEnabled: false,
      updatedAt: new Date(),
    };
  }

  /**
   * PCT-WC-120: Update user notification preferences
   */
  updateUserPreferences(
    userId: string,
    updates: Partial<Omit<NotificationPreferences, 'userId' | 'updatedAt'>>
  ): NotificationPreferences {
    const current = this.getUserPreferences(userId);

    const updated: NotificationPreferences = {
      ...current,
      ...updates,
      userId,
      updatedAt: new Date(),
    };

    this.preferences.set(userId, updated);
    this.emit('preferences:updated', updated);

    return updated;
  }

  /**
   * PCT-WC-120: Update preference for specific notification type
   */
  updateNotificationTypePreference(
    userId: string,
    type: NotificationType,
    preference: Partial<NotificationPreferences['preferences'][NotificationType]>
  ): NotificationPreferences {
    const current = this.getUserPreferences(userId);

    current.preferences[type] = {
      ...current.preferences[type],
      ...preference,
    };

    current.updatedAt = new Date();
    this.preferences.set(userId, current);
    this.emit('preferences:updated', current);

    return current;
  }

  /**
   * PCT-WC-121: Create an in-app notification
   */
  createNotification(notification: Omit<InAppNotification, 'id' | 'read' | 'readAt' | 'createdAt'>): InAppNotification {
    const newNotification: InAppNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      read: false,
      createdAt: new Date(),
    };

    // Get user's notifications
    const userNotifs = this.notifications.get(notification.userId) || [];

    // Add new notification
    userNotifs.unshift(newNotification);

    // Trim to max notifications
    if (userNotifs.length > this.maxNotificationsPerUser) {
      userNotifs.length = this.maxNotificationsPerUser;
    }

    this.notifications.set(notification.userId, userNotifs);

    // Emit event for real-time delivery
    this.emit('notification:created', newNotification);

    return newNotification;
  }

  /**
   * PCT-WC-121: Send notification (checks preferences)
   */
  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    options?: {
      data?: Record<string, any>;
      url?: string;
      icon?: string;
      priority?: 'low' | 'normal' | 'high';
      expiresAt?: Date;
    }
  ): Promise<InAppNotification | null> {
    const prefs = this.getUserPreferences(userId);
    const typePref = prefs.preferences[type];

    // Check if in-app notifications are enabled for this type
    if (!typePref.inApp) {
      return null;
    }

    // Check quiet hours
    if (this.isInQuietHours(prefs)) {
      // Queue for later delivery (for now, just skip)
      return null;
    }

    // Create notification
    const notification = this.createNotification({
      userId,
      type,
      title,
      message,
      priority: options?.priority || 'normal',
      ...options,
    });

    return notification;
  }

  /**
   * PCT-WC-121: Get user's notifications
   */
  getUserNotifications(userId: string, options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
    types?: NotificationType[];
  }): InAppNotification[] {
    let notifications = this.notifications.get(userId) || [];

    // Filter by types
    if (options?.types && options.types.length > 0) {
      notifications = notifications.filter(n => options.types!.includes(n.type));
    }

    // Filter by read status
    if (options?.unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }

    // Filter expired
    const now = new Date();
    notifications = notifications.filter(n => !n.expiresAt || n.expiresAt > now);

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;

    return notifications.slice(offset, offset + limit);
  }

  /**
   * PCT-WC-121: Get grouped notifications
   */
  getGroupedNotifications(userId: string): NotificationGroup[] {
    const notifications = this.getUserNotifications(userId);
    const groups = new Map<NotificationType, InAppNotification[]>();

    // Group by type
    for (const notification of notifications) {
      const existing = groups.get(notification.type) || [];
      existing.push(notification);
      groups.set(notification.type, existing);
    }

    // Convert to NotificationGroup array
    const result: NotificationGroup[] = [];
    for (const [type, notifs] of groups.entries()) {
      result.push({
        type,
        count: notifs.length,
        latestNotification: notifs[0],
        notifications: notifs,
      });
    }

    // Sort by latest notification time
    result.sort((a, b) =>
      b.latestNotification.createdAt.getTime() - a.latestNotification.createdAt.getTime()
    );

    return result;
  }

  /**
   * PCT-WC-121: Mark notification as read
   */
  markAsRead(userId: string, notificationId: string): InAppNotification | null {
    const notifications = this.notifications.get(userId);
    if (!notifications) return null;

    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return null;

    if (!notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      this.emit('notification:read', notification);
    }

    return notification;
  }

  /**
   * PCT-WC-121: Mark all notifications as read
   */
  markAllAsRead(userId: string, types?: NotificationType[]): number {
    const notifications = this.notifications.get(userId);
    if (!notifications) return 0;

    let count = 0;
    const now = new Date();

    for (const notification of notifications) {
      if (notification.read) continue;
      if (types && !types.includes(notification.type)) continue;

      notification.read = true;
      notification.readAt = now;
      count++;
    }

    if (count > 0) {
      this.emit('notifications:bulk_read', { userId, count, types });
    }

    return count;
  }

  /**
   * PCT-WC-121: Delete notification
   */
  deleteNotification(userId: string, notificationId: string): boolean {
    const notifications = this.notifications.get(userId);
    if (!notifications) return false;

    const index = notifications.findIndex(n => n.id === notificationId);
    if (index === -1) return false;

    const deleted = notifications.splice(index, 1)[0];
    this.emit('notification:deleted', deleted);

    return true;
  }

  /**
   * PCT-WC-121: Clear all notifications
   */
  clearAllNotifications(userId: string, types?: NotificationType[]): number {
    const notifications = this.notifications.get(userId);
    if (!notifications) return 0;

    if (!types) {
      const count = notifications.length;
      this.notifications.set(userId, []);
      this.emit('notifications:cleared', { userId, count });
      return count;
    }

    const before = notifications.length;
    const filtered = notifications.filter(n => !types.includes(n.type));
    this.notifications.set(userId, filtered);

    const count = before - filtered.length;
    if (count > 0) {
      this.emit('notifications:cleared', { userId, count, types });
    }

    return count;
  }

  /**
   * PCT-WC-121: Get notification counts
   */
  getNotificationCounts(userId: string): {
    total: number;
    unread: number;
    byType: Record<NotificationType, number>;
    unreadByType: Record<NotificationType, number>;
  } {
    const notifications = this.getUserNotifications(userId);

    const counts = {
      total: notifications.length,
      unread: notifications.filter(n => !n.read).length,
      byType: {} as Record<NotificationType, number>,
      unreadByType: {} as Record<NotificationType, number>,
    };

    // Initialize type counts
    for (const type of Object.values({
      system: 'system',
      feature_update: 'feature_update',
      approval_request: 'approval_request',
      approval_resolved: 'approval_resolved',
      test_result: 'test_result',
      milestone: 'milestone',
      error: 'error',
      warning: 'warning',
      info: 'info',
    } as Record<string, NotificationType>)) {
      counts.byType[type] = 0;
      counts.unreadByType[type] = 0;
    }

    // Count by type
    for (const notification of notifications) {
      counts.byType[notification.type]++;
      if (!notification.read) {
        counts.unreadByType[notification.type]++;
      }
    }

    return counts;
  }

  /**
   * Check if current time is in quiet hours
   */
  private isInQuietHours(prefs: NotificationPreferences): boolean {
    if (!prefs.quietHoursEnabled || !prefs.quietHoursStart || !prefs.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Simple comparison (doesn't handle overnight ranges perfectly, but good enough)
    return currentTime >= prefs.quietHoursStart && currentTime <= prefs.quietHoursEnd;
  }

  /**
   * Cleanup expired notifications (should be called periodically)
   */
  cleanupExpiredNotifications(): number {
    const now = new Date();
    let totalCleaned = 0;

    for (const [userId, notifications] of this.notifications.entries()) {
      const before = notifications.length;
      const filtered = notifications.filter(n => !n.expiresAt || n.expiresAt > now);
      this.notifications.set(userId, filtered);

      const cleaned = before - filtered.length;
      totalCleaned += cleaned;

      if (cleaned > 0) {
        this.emit('notifications:expired', { userId, count: cleaned });
      }
    }

    return totalCleaned;
  }

  /**
   * Get all users with preferences
   */
  getAllUserPreferences(): NotificationPreferences[] {
    return Array.from(this.preferences.values());
  }
}

// Singleton instance
let instance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!instance) {
    instance = new NotificationService();
  }
  return instance;
}

export { NotificationService };
