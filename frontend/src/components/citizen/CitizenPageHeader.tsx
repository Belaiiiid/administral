import type { ReactNode } from 'react';

import { CitizenBackButton } from '@/components/citizen/CitizenBackButton';
import { cn } from '@/lib/utils';

export interface CitizenPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Shows a "Retour" control above the eyebrow, falling back to this route
   *  when the tab has no history to pop. */
  backTo?: string;
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
  backTo,
  className,
}: CitizenPageHeaderProps) {
  return (
    <div className={cn('mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div>
        {backTo && <CitizenBackButton fallbackTo={backTo} className="mb-4" />}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-headline-lg-mobile leading-tight text-ink sm:text-3xl">
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
