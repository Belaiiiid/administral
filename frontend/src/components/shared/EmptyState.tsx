import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /**
   * `plain` — neutral placeholder (notification centre).
   * `suggestive` — dashed container inviting an action (dashboard).
   */
  variant?: 'plain' | 'suggestive';
  /**
   * `default` — page- or section-level placeholder.
   * `compact` — fits inside an existing card body without breaking its rhythm.
   */
  size?: 'default' | 'compact';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  variant = 'plain',
  size = 'default',
  className,
}: EmptyStateProps) {
  const isCompact = size === 'compact';

  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        isCompact ? 'px-4 py-6' : 'px-6 py-12',
        variant === 'suggestive' && 'rounded-xl border border-dashed border-border bg-surface-low',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full',
          isCompact ? 'mb-3 size-11' : 'mb-4 size-16',
          variant === 'suggestive'
            ? 'bg-surface-lowest text-primary shadow-soft'
            : 'border border-border text-on-surface-variant',
        )}
      >
        <Icon className={isCompact ? 'size-5' : 'size-7'} aria-hidden="true" />
      </div>
      <h3 className={isCompact ? 'text-label-md text-on-surface' : 'text-headline-md text-on-surface'}>
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'mt-2 max-w-md text-on-surface-variant',
            isCompact ? 'text-body-sm' : 'text-body-md',
          )}
        >
          {description}
        </p>
      )}
      {actions && (
        <div className={cn('flex flex-wrap justify-center gap-4', isCompact ? 'mt-4' : 'mt-6')}>
          {actions}
        </div>
      )}
    </div>
  );
}
