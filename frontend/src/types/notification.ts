import type { AdministrationId, StatusTone } from './common';

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
