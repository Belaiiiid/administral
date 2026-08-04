import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface CitizenCardProps {
  children: ReactNode;
  /** Adds the lift + brand-tinted border on hover used by interactive cards. */
  interactive?: boolean;
  className?: string;
}

/**
 * Administral surface — citizen area only. Structural twin of `components/ui/card`,
 * restyled with the Administral tokens (rounded-2xl, hairline border, soft shadow).
 * Kept separate so the agent back-office, which reuses the original `Card`, is
 * never affected by this redesign.
 */
export function CitizenCard({ children, interactive = false, className }: CitizenCardProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft',
        interactive &&
          'transition-all duration-200 ease-standard hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-soft-hover',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface CitizenCardHeaderProps {
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

export function CitizenCardHeader({ title, icon: Icon, action, className }: CitizenCardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-border/60 px-6 py-4',
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
        <h2 className="truncate font-display text-headline-md text-ink">{title}</h2>
      </span>
      {action}
    </div>
  );
}

export function CitizenCardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('p-6', className)}>{children}</div>;
}
