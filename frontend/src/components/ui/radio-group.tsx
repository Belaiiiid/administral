import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as React from 'react';

import { cn } from '@/lib/utils';

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-4', className)} {...props} />
));
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'aspect-square size-5 shrink-0 rounded-full border-2 border-outline-variant text-primary transition-colors',
      'data-[state=checked]:border-primary disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <span className="size-2.5 rounded-full bg-primary" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export interface RadioCardProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  label: string;
  description?: string;
}

/**
 * Selectable card-with-radio used by the simulator and the service picker.
 * Active state: primary border + #f0f4ff-adjacent tint (primary-fixed).
 */
const RadioCard = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioCardProps
>(({ className, label, description, id, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    id={id}
    className={cn(
      'group flex items-center gap-4 rounded-xl border border-border bg-surface-lowest p-4 text-left transition-all duration-200 ease-standard',
      'hover:border-outline-variant',
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary-fixed/40',
      className,
    )}
    {...props}
  >
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-outline-variant transition-colors group-data-[state=checked]:border-primary">
      <RadioGroupPrimitive.Indicator asChild>
        <span className="size-2.5 rounded-full bg-primary" />
      </RadioGroupPrimitive.Indicator>
    </span>
    <span className="flex flex-col gap-0.5">
      <span className="text-label-md text-on-surface">{label}</span>
      {description && <span className="text-body-sm text-on-surface-variant">{description}</span>}
    </span>
  </RadioGroupPrimitive.Item>
));
RadioCard.displayName = 'RadioCard';

export { RadioGroup, RadioGroupItem, RadioCard };
