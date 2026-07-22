import { Check, FileText, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AplTimelineEntry } from '@/types';

export interface TimelineProps {
  entries: AplTimelineEntry[];
  className?: string;
}

const DOT_STYLES: Record<AplTimelineEntry['status'], string> = {
  done: 'border-success bg-success text-success-foreground',
  current: 'border-secondary bg-secondary-fixed text-secondary',
  upcoming: 'border-border bg-surface-lowest text-on-surface-variant',
};

/** Vertical timeline with state dots — the « Historique de la demande » pattern. */
export function Timeline({ entries, className }: TimelineProps) {
  return (
    <ol className={cn('relative flex flex-col', className)}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        return (
          <li key={entry.id} className="relative flex gap-4 pb-8 last:pb-0">
            {!isLast && (
              <span aria-hidden="true" className="absolute left-[19px] top-10 h-full w-0.5 bg-border" />
            )}
            <span
              className={cn(
                'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2',
                DOT_STYLES[entry.status],
              )}
            >
              {entry.status === 'done' && <Check className="size-5" aria-hidden="true" />}
              {entry.status === 'current' && (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              )}
              {entry.status === 'upcoming' && (
                <span className="size-2 rounded-full bg-current" aria-hidden="true" />
              )}
            </span>

            <div
              className={cn(
                'flex-1 rounded-lg',
                entry.status === 'current' && 'bg-secondary-fixed/30 p-4',
                entry.status === 'upcoming' && 'opacity-60',
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-label-md text-on-surface">{entry.label}</h3>
                {entry.date && (
                  <span className="text-body-sm text-on-surface-variant">{entry.date}</span>
                )}
              </div>
              <p className="mt-1 text-body-sm text-on-surface-variant">{entry.description}</p>

              {entry.attachments && entry.attachments.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {entry.attachments.map((file) => (
                    <li
                      key={file.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface-lowest px-3 py-1.5 text-body-sm text-on-surface-variant"
                    >
                      <FileText className="size-4" aria-hidden="true" />
                      {file.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
