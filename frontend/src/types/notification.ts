import type { AdministrationId, StatusTone } from './common';

/**
 * Legacy mock shape, kept only for the not-yet-built portal service stub
 * (`services/portalService.ts`). Real notifications use {@link AppNotification}.
 */
export interface CitizenNotification {
  id: string;
  administration: AdministrationId;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  tone: StatusTone;
  /** Whether this notification was surfaced by the assistant. */
  aiSuggested?: boolean;
  actions?: { id: string; label: string; variant?: 'primary' | 'outline' }[];
}

/** Mirrors the backend `NotificationType` enum. */
export type NotificationType =
  | 'dossier_submitted'
  | 'dossier_validated'
  | 'dossier_rejected';

/**
 * A real notification, as served by `GET /api/notifications`. One row, one
 * recipient — the same shape for both portals; the backend only ever returns the
 * caller's own.
 */
export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep-link handle — an `application_number`. Null when the event has none. */
  reference: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: AppNotification[];
  unreadCount: number;
}
