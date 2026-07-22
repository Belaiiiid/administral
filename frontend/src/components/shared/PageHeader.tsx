import * as React from 'react';

import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Breadcrumb or back-link slot rendered above the title. */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The page-level heading block. Renders the single <h1> of each page and
 * downscales the display size on mobile (design-analysis §3.2).
 */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div>
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-headline-lg-mobile text-primary md:text-display">{title}</h1>
        {description && (
          <p className="mt-1 text-body-md text-on-surface-variant">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
