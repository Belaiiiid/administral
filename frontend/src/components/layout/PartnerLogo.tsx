import { useState } from 'react';

import { cn } from '@/lib/utils';

export interface PartnerLogoProps {
  /** Root-relative path under `public/`, e.g. `/logos/talan.png`. */
  src: string;
  alt: string;
  /** Shown if the image at `src` hasn't been dropped in yet. */
  fallbackLabel: string;
  className?: string;
}

/**
 * Renders a partner mark from `public/logos/`, falling back to a text
 * wordmark when the asset file hasn't been added to the repo yet — so the
 * layout is correct as soon as the real logo lands, with no code change.
 */
export function PartnerLogo({ src, alt, fallbackLabel, className }: PartnerLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={cn(
          'text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant',
          className,
        )}
      >
        {fallbackLabel}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn('h-6 w-auto object-contain', className)}
      onError={() => setFailed(true)}
    />
  );
}
