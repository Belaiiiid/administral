import * as React from 'react';

import { cn } from '@/lib/utils';

export interface SectionHeaderProps {
  title: string;
  action?: React.ReactNode;
  /** Heading level — keeps the document outline correct. */
  as?: 'h2' | 'h3';
  /**
   * Applied to the heading itself so a landmark can reference it with
   * `aria-labelledby` — no duplicated `sr-only` heading required.
   */
  id?: string;
  className?: string;
}

/** Uppercase label-md section title with an optional trailing action. */
export function SectionHeader({
  title,
  action,
  as: Heading = 'h3',
  id,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <Heading id={id} className="section-title">
        {title}
      </Heading>
      {action}
    </div>
  );
}
