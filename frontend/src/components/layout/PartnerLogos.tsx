import { PartnerLogo } from '@/components/layout/PartnerLogo';
import { cn } from '@/lib/utils';

/**
 * Talan (delivery partner) and Mistral AI (model provider) marks, shown
 * together wherever the MonParcours brand appears so the page never reads as
 * a solo government product with no named partners behind it.
 */
export function PartnerLogos({
  className,
  logoClassName,
  mistralMark = 'chat',
}: {
  className?: string;
  /** Overrides each logo's default `h-6` — e.g. a larger size on the auth page. */
  logoClassName?: string;
  /**
   * Which Mistral mark to show:
   * - `chat` — the "Le Chat" mascot (the default everywhere else);
   * - `wordmark` — the company's own "M" logo, used on the auth page where the
   *   marks read as corporate partners rather than as a product;
   * - `brand` — the 2025 brand mark, used by the agent back-office rail: an
   *   instruction desk is a working tool, and the animated mascot reads as
   *   product marketing there where a still corporate mark does not.
   */
  mistralMark?: 'chat' | 'wordmark' | 'brand';
}) {
  const mistralSrc = {
    chat: '/logos/mistral.gif',
    wordmark: '/mistral-logo.svg',
    brand: '/logos/mistral-2025.webp',
  }[mistralMark];

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <PartnerLogo src="/logos/talan.png" alt="Talan" fallbackLabel="Talan" className={logoClassName} />
      <PartnerLogo
        src={mistralSrc}
        alt="Mistral AI"
        fallbackLabel="Mistral AI"
        className={logoClassName}
      />
    </div>
  );
}
