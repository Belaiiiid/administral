import { Bell, CheckCircle2, Inbox, XCircle } from 'lucide-react';

import { EmptyState } from '@/components/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AppNotification, NotificationType } from '@/types';

/**
 * Presentational notification list — shared by both portals.
 *
 * Pure UI: it renders whatever `items` it is handed and calls back on
 * interaction. It never fetches, so it cannot mix one role's data with
 * another's — the data comes from the caller's role-scoped store.
 */
export interface NotificationListProps {
  items: AppNotification[];
  onMarkRead: (id: number) => void;
  isLoading?: boolean;
}

const TYPE_STYLE: Record<NotificationType, { icon: typeof Bell; className: string }> = {
  dossier_submitted: { icon: Inbox, className: 'bg-primary-fixed text-primary' },
  dossier_validated: { icon: CheckCircle2, className: 'bg-success-surface text-success' },
  dossier_rejected: { icon: XCircle, className: 'bg-destructive-surface text-destructive' },
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function NotificationList({ items, onMarkRead, isLoading = false }: NotificationListProps) {
  if (!isLoading && items.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={CheckCircle2}
            title="Aucune notification"
            description="Vos communications apparaîtront ici dès qu’un évènement concernera votre dossier."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((notification) => {
        const { icon: Icon, className } = TYPE_STYLE[notification.type] ?? {
          icon: Bell,
          className: 'bg-surface-container text-on-surface-variant',
        };

        return (
          <li key={notification.id}>
            <Card
              className={cn(
                'relative overflow-hidden transition-colors',
                !notification.read && 'border-l-4 border-l-primary',
              )}
            >
              <CardContent className="flex gap-4 p-5">
                <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', className)}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-label-md text-on-surface">
                      {!notification.read && <span className="sr-only">Non lue : </span>}
                      {notification.title}
                    </h3>
                    <span className="text-body-sm text-on-surface-variant">
                      {formatWhen(notification.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-body-sm text-on-surface-variant">{notification.body}</p>

                  {!notification.read && (
                    <button
                      type="button"
                      onClick={() => onMarkRead(notification.id)}
                      className="mt-3 text-label-sm text-primary hover:underline"
                    >
                      Marquer comme lue
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
