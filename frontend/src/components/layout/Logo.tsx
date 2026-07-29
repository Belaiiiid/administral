import { Landmark } from 'lucide-react';

import { APP_CONFIG } from '@/app/config/app';
import { cn } from '@/lib/utils';

export interface LogoProps {
  /** Hide the wordmark, keeping only the mark (collapsed rails). */
  markOnly?: boolean;
  className?: string;
}

export function Logo({ markOnly = false, className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Landmark className="size-5" aria-hidden="true" />
      </span>
      {!markOnly && (
        <span className="flex flex-col leading-tight">
          <span className="text-headline-md text-primary">{APP_CONFIG.name}</span>
          <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
            Service Public
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * The tricolore block of the République Française identity.
 *
 * Vertical bands, blue-white-red left to right — the French flag. Horizontal
 * bands would be the Dutch one; easy to get backwards since both use the same
 * three colours, so it's worth this note.
 */
export function RepublicMark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="flex h-4 w-6 flex-row overflow-hidden rounded-sm border border-border"
      >
        <span className="w-1/3 bg-rf-blue" />
        <span className="w-1/3 bg-rf-white" />
        <span className="w-1/3 bg-rf-red" />
      </span>
      <span className="text-label-sm uppercase tracking-tight text-on-surface">
        République Française
      </span>
    </div>
  );
}
