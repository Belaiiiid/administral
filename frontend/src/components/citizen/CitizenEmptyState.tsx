import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface CitizenEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** `compact` fits inside an existing card body without breaking its rhythm. */
  size?: 'default' | 'compact';
  /** `error` tints the icon badge red — used for load failures rather than emptiness. */
  tone?: 'neutral' | 'error';
  className?: string;
}

/**
 * Administral placeholder — citizen area only. Structural twin of
 * `components/shared/EmptyState`, restyled with the Administral tokens.
 * Kept separate so the agent back-office, which reuses the original, is never
 * affected by this redesign.
 */
export function CitizenEmptyState({
  icon: Icon,
  title,
  description,
  actions,
  size = 'default',
  tone = 'neutral',
  className,
}: CitizenEmptyStateProps) {
  const isCompact = size === 'compact';

  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-2xl border border-dashed border-border/60 bg-surface text-center',
        isCompact ? 'px-4 py-8' : 'px-6 py-16',
        className,
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full',
          isCompact ? 'size-11' : 'size-16',
          tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-brand-soft text-brand',
        )}
      >
        <Icon className={isCompact ? 'size-5' : 'size-7'} aria-hidden="true" />
      </span>
      <h3
        className={cn(
          'mt-4 font-display font-bold text-ink',
          isCompact ? 'text-sm' : 'text-lg',
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'mt-2 max-w-md leading-relaxed text-muted-foreground',
            isCompact ? 'text-xs' : 'text-sm',
          )}
        >
          {description}
        </p>
      )}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}
