import { useEffect } from 'react';

import { NotificationList } from '@/components/notifications/NotificationList';
import { PageHeader } from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Centre de notifications"
        description="Le suivi de vos démarches, en temps réel."
        actions={
          <Button variant="outline" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
            Tout marquer comme lu
          </Button>
        }
      />

      {error && (
        <Alert tone="error" className="mb-gutter">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <NotificationList items={items} onMarkRead={(id) => void markRead(id)} isLoading={isLoading} />
    </div>
  );
}
