import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface StepperStep {
  id: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** 1-based index of the active step. */
  current: number;
  className?: string;
}

/**
 * Horizontal on desktop, vertical on mobile (design-analysis §2.2).
 * Uses an ordered list so screen readers announce position and total.
 */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <nav aria-label="Progression du parcours" className={className}>
      <ol className="flex flex-col gap-4 md:flex-row md:items-start md:gap-0">
        {steps.map((step, index) => {
          const position = index + 1;
          const isDone = position < current;
          const isCurrent = position === current;
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.id}
              className="flex items-center gap-4 md:flex-1 md:flex-col md:gap-2"
              aria-current={isCurrent ? 'step' : undefined}
            >
              <div className="flex items-center gap-4 md:w-full md:gap-0">
                {/* Leading connector (desktop only) */}
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'hidden h-0.5 flex-1 md:block',
                      isDone || isCurrent ? 'bg-primary' : 'bg-surface-highest',
                    )}
                  />
                )}
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-label-md transition-colors',
                    isDone && 'border-primary bg-primary text-primary-foreground',
                    isCurrent && 'border-primary bg-primary text-primary-foreground',
                    !isDone && !isCurrent && 'border-border bg-surface-lowest text-on-surface-variant',
                  )}
                >
                  {isDone ? <Check className="size-5" aria-hidden="true" /> : position}
                </span>
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'hidden h-0.5 flex-1 md:block',
                      isDone ? 'bg-primary' : 'bg-surface-highest',
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  'text-label-md md:text-center',
                  isCurrent ? 'text-on-surface' : 'text-on-surface-variant',
                )}
              >
                <span className="sr-only">{`Étape ${position} sur ${steps.length} : `}</span>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
