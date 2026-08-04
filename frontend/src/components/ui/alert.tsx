import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Left-accent-border alert, the pattern used for « À noter » callouts and
 * inline analysis results across the screens.
 */
const alertVariants = cva('flex gap-3 rounded-lg border-l-4 p-4 [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0', {
  variants: {
    tone: {
      info: 'border-l-primary bg-surface-low text-on-surface [&_svg]:text-primary',
      ai: 'border-l-ai bg-ai-surface text-on-surface [&_svg]:text-ai',
      success: 'border-l-success bg-success-surface text-on-surface [&_svg]:text-success',
      // Fond soutenu : texte et icône passent en blanc, contrairement aux
      // autres tons dont la surface est pâle et porte `--on-surface`.
      warning: 'border-l-warning bg-warning-surface text-warning-foreground [&_svg]:text-warning-foreground',
      error: 'border-l-destructive bg-destructive-surface text-on-surface [&_svg]:text-destructive',
      accent: 'border-l-secondary bg-secondary-fixed/40 text-on-surface [&_svg]:text-secondary',
    },
  },
  defaultVariants: { tone: 'info' },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(({ className, tone, ...props }, ref) => (
  <div ref={ref} role="status" className={cn(alertVariants({ tone }), className)} {...props} />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-label-md', className)} {...props} />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-body-sm text-on-surface-variant', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
