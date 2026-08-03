import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface CitizenPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Page-level heading block for the Administral-redesigned citizen area.
 * Structural twin of `components/shared/PageHeader`, restyled with the
 * Administral tokens (eyebrow label, `font-display` title, `text-ink`).
 */
export function CitizenPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: CitizenPageHeaderProps) {
  return (
    <div className={cn('mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
