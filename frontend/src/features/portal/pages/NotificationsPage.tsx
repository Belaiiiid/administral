import { Bell, CheckCircle2, SlidersHorizontal } from 'lucide-react';

import { SERVICES } from '@/app/config/services';
import { EmptyState, PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { CitizenNotification } from '@/types';

/**
 * Notification centre.
 *
 * The list is intentionally empty: `portalService.listNotifications()` will
 * supply it. `NotificationRow` stays here as the rendering contract.
 */
const NOTIFICATIONS: CitizenNotification[] = [];

const TONE_STYLES = {
  error: 'bg-destructive-surface text-destructive',
  info: 'bg-primary-fixed text-primary',
  accent: 'bg-secondary-fixed text-secondary',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning',
  neutral: 'bg-surface-container text-on-surface-variant',
} as const;

function NotificationRow({ notification }: { notification: CitizenNotification }) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="flex gap-4 p-6">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-full ${TONE_STYLES[notification.tone]}`}
        >
          <Bell className="size-5" aria-hidden="true" />
        </span>

        <div className="flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-label-md text-on-surface">
              {!notification.read && <span className="sr-only">Non lue : </span>}
              {notification.title}
            </h3>
            <span className="text-body-sm text-on-surface-variant">{notification.createdAt}</span>
          </div>
          <p className="mt-1 text-body-sm text-on-surface-variant">{notification.body}</p>

          {notification.actions && (
            <div className="mt-4 flex flex-wrap gap-3">
              {notification.actions.map((action) => (
                <Button
                  key={action.id}
                  size="sm"
                  variant={action.variant === 'primary' ? 'primary' : 'outline'}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function NotificationsPage() {
  useDocumentTitle('Centre de notifications');

  const hasNotifications = NOTIFICATIONS.length > 0;

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Centre de notifications"
        description="Gérez vos communications administratives centralisées."
        actions={
          <>
            <Button variant="outline" disabled={!hasNotifications}>
              Tout marquer comme lu
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Filtrer les notifications"
              disabled={!hasNotifications}
            >
              <SlidersHorizontal aria-hidden="true" />
            </Button>
          </>
        }
      />

      {/* Per-administration counters */}
      <ul className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SERVICES.map((service) => {
          const count = NOTIFICATIONS.filter(
            (n) => n.administration === service.id && !n.read,
          ).length;

          return (
            <li key={service.id}>
              <Card className="h-full">
                <CardContent className="p-4">
                  <p className="text-label-md text-on-surface">{service.administration}</p>
                  <p className="text-body-sm text-on-surface-variant">
                    {count === 0 ? 'Aucune nouvelle' : `${count} nouvelle${count > 1 ? 's' : ''}`}
                  </p>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {/* Grouped lists */}
      {hasNotifications ? (
        <div className="flex flex-col gap-8">
          {SERVICES.map((service) => {
            const items = NOTIFICATIONS.filter((n) => n.administration === service.id);
            if (items.length === 0) return null;

            return (
              <section key={service.id} aria-labelledby={`notif-${service.id}`}>
                <h2
                  id={`notif-${service.id}`}
                  className="mb-4 text-label-sm uppercase tracking-widest text-on-surface-variant"
                >
                  {service.administration}
                </h2>
                <ul className="flex flex-col gap-4">
                  {items.map((notification) => (
                    <li key={notification.id}>
                      <NotificationRow notification={notification} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CheckCircle2}
              title="Aucune notification"
              description="Vos communications administratives apparaîtront ici dès qu’une administration vous écrira."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
