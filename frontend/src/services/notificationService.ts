import type { AppNotification, NotificationList } from '@/types';
import { apiClient } from './apiClient';

/**
 * Notifications API — shared by both portals.
 *
 * There is one real backend endpoint set (`/notifications`), scoped to the
 * authenticated user, so a citizen and an agent call the very same methods and
 * each receive only their own rows. No role branching here: the server does it.
 */
export interface NotificationService {
  list(): Promise<NotificationList>;
  unreadCount(): Promise<number>;
  markRead(id: number): Promise<AppNotification>;
  /** Mark every unread notification read. Resolves to the new count (0). */
  markAllRead(): Promise<number>;
}

interface UnreadCountResponse {
  unreadCount: number;
}

export const notificationService: NotificationService = {
  list: () => apiClient.get<NotificationList>('/notifications'),
  unreadCount: () =>
    apiClient.get<UnreadCountResponse>('/notifications/unread-count').then((r) => r.unreadCount),
  markRead: (id) => apiClient.post<AppNotification>(`/notifications/${id}/read`, {}),
  markAllRead: () =>
    apiClient.post<UnreadCountResponse>('/notifications/read-all', {}).then((r) => r.unreadCount),
};
