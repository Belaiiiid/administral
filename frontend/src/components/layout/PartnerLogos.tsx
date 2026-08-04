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
   * Which Mistral mark to show: `chat` is the "Le Chat" mascot (the default
   * everywhere else), `wordmark` the company's own "M" logo — used on the auth
   * page, where the marks read as corporate partners rather than as a product.
   */
  mistralMark?: 'chat' | 'wordmark';
}) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <PartnerLogo src="/logos/talan.png" alt="Talan" fallbackLabel="Talan" className={logoClassName} />
      <PartnerLogo
        src={mistralMark === 'wordmark' ? '/mistral-logo.svg' : '/logos/mistral.gif'}
        alt="Mistral AI"
        fallbackLabel="Mistral AI"
        className={logoClassName}
      />
    </div>
  );
}
