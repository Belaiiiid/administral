import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-sm [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-container text-on-surface-variant',
        info: 'bg-primary-fixed text-primary',
        success: 'bg-success-surface text-success',
        warning: 'bg-warning-surface text-warning',
        error: 'bg-destructive-surface text-destructive',
        accent: 'bg-secondary-fixed text-secondary-on-fixed',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
