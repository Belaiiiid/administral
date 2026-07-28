import { create } from 'zustand';

import { ApiClientError } from '@/services/apiClient';
import { notificationService } from '@/services/notificationService';
import type { AppNotification } from '@/types';

/**
 * The authenticated user's notifications.
 *
 * One store, both portals — and no leak: it holds only what
 * `GET /api/notifications` returns, which the backend scopes to the caller. The
 * header badge and the notifications page read the same `unreadCount`, so
 * marking one read updates the bell without a second round-trip.
 *
 * Cleared on logout (`sessionStore.logout` calls `reset`) so the next account
 * never briefly sees the previous one's rows.
 */
interface NotificationState {
  items: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  /** True once the full list has been fetched at least once. */
  loaded: boolean;

  /** Fetch the full list (list view). */
  load: () => Promise<void>;
  /** Fetch just the unread count (header badge — cheap). */
  refreshCount: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
}

function messageFrom(err: unknown): string {
  if (err instanceof ApiClientError) return err.payload.message;
  return err instanceof Error ? err.message : 'Erreur inconnue.';
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  loaded: false,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const { items, unreadCount } = await notificationService.list();
      set({ items, unreadCount, isLoading: false, loaded: true });
    } catch (err) {
      set({ isLoading: false, error: messageFrom(err) });
    }
  },

  refreshCount: async () => {
    try {
      const unreadCount = await notificationService.unreadCount();
      set({ unreadCount });
    } catch {
      // The badge is not worth surfacing an error for — leave the last count.
    }
  },

  markRead: async (id) => {
    // Optimistic: flip it locally, then reconcile. A failed request reloads.
    const previous = get().items;
    if (!previous.some((n) => n.id === id && !n.read)) return;
    set((state) => ({
      items: state.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
    try {
      await notificationService.markRead(id);
    } catch {
      void get().load();
    }
  },

  markAllRead: async () => {
    const hadUnread = get().unreadCount > 0;
    if (!hadUnread) return;
    set((state) => ({
      items: state.items.map((n) => (n.read ? n : { ...n, read: true })),
      unreadCount: 0,
    }));
    try {
      await notificationService.markAllRead();
    } catch {
      void get().load();
    }
  },

  reset: () => set({ items: [], unreadCount: 0, isLoading: false, error: null, loaded: false }),
}));
