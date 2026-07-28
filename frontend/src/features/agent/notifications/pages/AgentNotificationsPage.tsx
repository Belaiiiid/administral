import { useEffect } from 'react';

import { NotificationList } from '@/components/notifications/NotificationList';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AgentPage } from '@/features/agent/components';
import { useNotificationStore } from '@/store/notificationStore';

/**
 * Agent notification centre — real, backend-wired.
 *
 * The same store and endpoint as the citizen page; the backend scopes rows to
 * the caller, so an agent sees only agent-addressed events (a new dossier
 * landing in the queue), never a citizen's.
 */
export default function AgentNotificationsPage() {
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
    <AgentPage
      title="Notifications"
      description="Les évènements de la file d’instruction."
      provisional={false}
      actions={
        <Button variant="outline" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
          Tout marquer comme lu
        </Button>
      }
    >
      {error && (
        <Alert tone="error" className="mb-gutter">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <NotificationList items={items} onMarkRead={(id) => void markRead(id)} isLoading={isLoading} />
    </AgentPage>
  );
}
