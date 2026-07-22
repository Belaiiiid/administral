import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Button variants transcribed from the Stitch screens.
 * Sizes respect the 44px minimum tap target (design-analysis §3.3).
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-label-md transition-all duration-200 ease-standard disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-soft hover:opacity-90 active:scale-[0.98]',
        outline:
          'border border-border bg-surface-lowest text-on-surface-variant hover:bg-surface-container',
        'outline-primary':
          'border border-primary bg-transparent text-primary hover:bg-primary-fixed active:scale-95',
        secondary: 'bg-secondary text-secondary-foreground shadow-soft hover:opacity-90',
        ghost: 'text-on-surface-variant hover:bg-surface-high',
        destructive: 'bg-destructive-strong text-destructive-foreground hover:opacity-90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-label-sm',
        md: 'h-11 px-4',
        lg: 'h-12 px-8 text-headline-md',
        icon: 'size-11',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. a react-router <Link />). */
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
