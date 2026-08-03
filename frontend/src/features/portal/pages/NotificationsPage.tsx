import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

import { CitizenNotificationList } from '@/components/citizen/CitizenNotificationList';
import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotificationStore } from '@/store/notificationStore';

/**
 * Citizen notification centre — real, backend-wired.
 *
 * The list is whatever `GET /api/notifications` returns for the signed-in
 * citizen: dossier decisions, today. It shares its store with the header badge,
 * so marking one read updates the bell immediately.
 */
export default function NotificationsPage() {
  useDocumentTitle('Centre de notifications');

  const items = useNotificationStore((state) => state.items);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const isLoading = useNotificationStore((state) => state.isLoading);
  const error = useNotificationStore((state) => state.error);
  const load = useNotificationStore((state) => state.load);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl">
      <CitizenPageHeader
        eyebrow="Suivi en temps réel"
        title="Centre de notifications"
        description="Le suivi de vos démarches, dès qu’il y a du nouveau."
        actions={
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-2 rounded-md border border-brand/40 bg-background px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background"
          >
            Tout marquer comme lu
          </button>
        }
      />

      {error && (
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <CitizenNotificationList items={items} onMarkRead={(id) => void markRead(id)} isLoading={isLoading} />
    </div>
  );
}
