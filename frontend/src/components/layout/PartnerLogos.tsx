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
  talanClassName,
  mistralClassName,
  mistralMark = 'wordmark',
}: {
  className?: string;
  /** Overrides each logo's default `h-6` — e.g. a larger size on the auth page. */
  logoClassName?: string;
  /**
   * Réglage par marque, appliqué après `logoClassName`.
   *
   * Les deux fichiers n'ont pas le même cadrage : le PNG Talan (200×69) embarque
   * la signature « Positive innovation » sous le mot-symbole, là où le SVG
   * Mistral (viewBox 21×15) est un bloc serré sans marge. À hauteur de boîte
   * identique, le mot « TALAN » ne remplit que ~70% de la sienne et paraît
   * nettement plus petit. D'où la possibilité de donner une hauteur propre à
   * chacune là où les deux marques doivent peser pareil.
   */
  talanClassName?: string;
  mistralClassName?: string;
  /**
   * Which Mistral mark to show:
   * - `wordmark` — the company's own "M" logo, and the default everywhere: it
   *   reads as a named corporate partner, which is what a « Propulsé par »
   *   line means, where the mascot read as product marketing;
   * - `brand` — the 2025 brand mark, kept for the agent back-office rail;
   * - `chat` — the "Le Chat" mascot. No longer used by any surface, kept only
   *   so a caller can opt back in deliberately.
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
      <PartnerLogo
        src="/logos/talan.png"
        alt="Talan"
        fallbackLabel="Talan"
        className={cn(logoClassName, talanClassName)}
      />
      <PartnerLogo
        src={mistralSrc}
        alt="Mistral AI"
        fallbackLabel="Mistral AI"
        className={cn(logoClassName, mistralClassName)}
      />
    </div>
  );
}
