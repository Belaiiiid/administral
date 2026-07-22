import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icon rendered inside the field, on the leading edge. */
  startIcon?: React.ReactNode;
  /** Text suffix (e.g. « EUR ») or an action button on the trailing edge. */
  endAdornment?: React.ReactNode;
}

/**
 * White field, 1px border, 8px radius. On focus the border turns primary and a
 * 2px ring at 20% opacity appears (design-analysis §2.1).
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', startIcon, endAdornment, ...props }, ref) => {
    const field = (
      <input
        ref={ref}
        type={type}
        className={cn(
          'h-11 w-full rounded-lg border border-border bg-surface-lowest px-4 text-body-md text-on-surface',
          'placeholder:text-muted-foreground',
          'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0',
          'disabled:cursor-not-allowed disabled:bg-surface-low disabled:opacity-60',
          'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20',
          startIcon && 'pl-11',
          endAdornment && 'pr-14',
          className,
        )}
        {...props}
      />
    );

    if (!startIcon && !endAdornment) return field;

    return (
      <div className="relative w-full">
        {startIcon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant [&_svg]:size-4"
          >
            {startIcon}
          </span>
        )}
        {field}
        {endAdornment && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-body-sm text-on-surface-variant">
            {endAdornment}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

export { Input };
