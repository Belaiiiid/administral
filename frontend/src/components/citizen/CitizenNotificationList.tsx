import { Bell, CheckCircle2, Inbox, XCircle } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AppNotification, NotificationType } from '@/types';

export interface CitizenNotificationListProps {
  items: AppNotification[];
  onMarkRead: (id: number) => void;
  isLoading?: boolean;
}

const TYPE_STYLE: Record<NotificationType, { icon: typeof Bell; className: string }> = {
  dossier_submitted: { icon: Inbox, className: 'bg-brand-soft text-brand' },
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

/**
 * Administral-styled notification list — citizen area only. Structural twin
 * of `components/notifications/NotificationList`, restyled with the
 * Administral tokens. Kept separate so the agent back-office notification
 * centre, which reuses the original list, is never affected by this
 * redesign.
 */
export function CitizenNotificationList({
  items,
  onMarkRead,
  isLoading = false,
}: CitizenNotificationListProps) {
  if (isLoading) {
    return (
      <ul className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="rounded-2xl border border-border/60 bg-card p-5 shadow-soft">
            <div className="flex gap-4">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-full max-w-md" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/60 bg-surface px-6 py-16 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <h3 className="mt-4 font-display text-lg font-bold text-ink">Aucune notification</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Vos communications apparaîtront ici dès qu’un évènement concernera votre dossier.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((notification) => {
        const { icon: Icon, className } = TYPE_STYLE[notification.type] ?? {
          icon: Bell,
          className: 'bg-surface text-muted-foreground',
        };

        return (
          <li key={notification.id}>
            <article
              className={cn(
                'flex gap-4 rounded-2xl border border-border/60 bg-card p-5 shadow-soft transition-all duration-200 ease-standard hover:border-brand/30 hover:shadow-soft-hover',
                !notification.read && 'border-l-4 border-l-brand',
              )}
            >
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', className)}>
                <Icon className="size-5" aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-label-md text-ink">
                    {!notification.read && <span className="sr-only">Non lue : </span>}
                    {notification.title}
                  </h3>
                  <span className="text-xs text-muted-foreground">{formatWhen(notification.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{notification.body}</p>

                {!notification.read && (
                  <button
                    type="button"
                    onClick={() => onMarkRead(notification.id)}
                    className="mt-3 text-label-sm text-brand hover:underline"
                  >
                    Marquer comme lue
                  </button>
                )}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
