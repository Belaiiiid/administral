import {
  Accessibility,
  ArrowRight,
  Briefcase,
  Building2,
  GraduationCap,
  Hammer,
  HeartPulse,
  Home,
  IdCard,
  Landmark,
  Lock,
  PiggyBank,
  Receipt,
  Tractor,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import type { AdministrationId, ServiceDefinition } from '@/types';

/** One recognisable icon per administration, rather than a single generic mark repeated. */
export const ADMINISTRATION_ICONS: Record<AdministrationId, LucideIcon> = {
  caf: Home,
  'france-travail': Briefcase,
  'assurance-maladie': HeartPulse,
  impots: Receipt,
  retraite: PiggyBank,
  ants: IdCard,
  urssaf: Building2,
  msa: Tractor,
  crous: GraduationCap,
  anah: Hammer,
  mdph: Accessibility,
  'service-public': Landmark,
};

/**
 * `default` is the landing-page size (carousel, three per row on a wide
 * screen). `compact` is the same card scaled down for the `/administrations`
 * grid, which shows every administration at once and so has less room per tile.
 */
type ServiceCardSize = 'default' | 'compact';

interface SizeTokens {
  panel: string;
  badge: string;
  badgeIcon: string;
  body: string;
  name: string;
  description: string;
  cta: string;
  logo: string;
}

const SIZES: Record<ServiceCardSize, SizeTokens> = {
  default: {
    panel: 'h-56',
    badge: 'size-14',
    badgeIcon: 'size-6',
    body: 'p-6 pt-8',
    name: 'text-xl',
    description: 'mt-2 line-clamp-6 text-base sm:line-clamp-4',
    cta: 'py-3 text-base',
    logo: 'max-h-24 max-w-[62%]',
  },
  compact: {
    panel: 'h-36',
    badge: 'size-12',
    badgeIcon: 'size-5',
    body: 'p-5 pt-7',
    name: 'text-base',
    description: 'mt-2 line-clamp-3 text-sm',
    cta: 'py-2.5 text-sm',
    logo: 'max-h-20 max-w-[76%]',
  },
};

/**
 * An administration tile — photo panel, overlapping icon badge, name, what the
 * abbreviation stands for, and a filled call-to-action.
 *
 * Shared by the public landing carousel (`LandingServices`) and the
 * `/administrations` grid so the two never drift apart; `size` is the only
 * difference between them.
 *
 * The whole tile is clickable without nesting anything inside a wrapper link:
 * the CTA carries `after:absolute after:inset-0`, so its hit area covers the
 * card while the accessible name stays on the one real link.
 */
export interface ServiceCardProps {
  name: string;
  /** What an abbreviated `name` stands for — most citizens meet these as acronyms only. */
  fullName?: string;
  description: string;
  /** Where the call-to-action leads. Ignored when `available` is false. */
  to: string;
  available: boolean;
  icon: LucideIcon;
  /** Artwork filling the panel, cropped to it (`object-cover`). */
  imageUrl?: string;
  /** Used only when there is no `imageUrl` — contained, for a logo mark. */
  logoUrl?: string;
  ctaLabel?: string;
  size?: ServiceCardSize;
  /** Overrides the badge's default deep navy, for a per-service accent. */
  badgeClassName?: string;
  className?: string;
}

export function ServiceCard({
  name,
  fullName,
  description,
  to,
  available,
  icon: Icon,
  imageUrl,
  logoUrl,
  ctaLabel = 'Accéder au service',
  size = 'default',
  badgeClassName,
  className,
}: ServiceCardProps) {
  const s = SIZES[size];

  return (
    <article
      className={cn(
        'group/card relative flex h-full flex-col overflow-hidden rounded-sm border-2 border-border/60 bg-card shadow-soft',
        'transition-all duration-300 ease-out',
        // Siblings recede while any card in the group is hovered…
        'group-hover/cards:scale-[0.97] group-hover/cards:opacity-50',
        // …and the hovered one wins both back, plus a brand border.
        'hover:!scale-[1.03] hover:!opacity-100 hover:border-brand hover:shadow-soft-hover hover:shadow-brand/10',
        // Keyboard parity: the CTA is the focus target, so the card reacts to
        // focus *within* it rather than only to a mouse.
        'focus-within:border-brand focus-within:shadow-soft',
        className,
      )}
    >
      <div
        className={cn(
          'relative w-full shrink-0',
          s.panel,
          // An official logo is drawn for white paper; a tint behind it reads as
          // a mistake. Anything else gets the usual status-coloured panel.
          !imageUrl && logoUrl
            ? 'bg-surface-lowest'
            : available
              ? 'bg-brand-soft'
              : 'bg-surface-container',
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
          />
        ) : logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            aria-hidden="true"
            className={cn(
              'absolute inset-0 m-auto object-contain transition-transform duration-500 ease-out group-hover/card:scale-105',
              s.logo,
            )}
          />
        ) : (
          // No artwork for this service yet: a large watermark of its own icon,
          // which reads as deliberate where a stretched placeholder would not.
          // `opacity-25` rather than `text-brand/25`: the brand token is a full
          // `oklch(...)` value, so Tailwind's colour-opacity modifier is a no-op on it.
          <Icon
            className="absolute inset-0 m-auto size-20 text-brand opacity-25"
            strokeWidth={1.25}
            aria-hidden="true"
          />
        )}

        <span
          className={cn(
            'absolute bottom-0 left-6 z-10 flex translate-y-1/2 items-center justify-center rounded-full text-white shadow-soft ring-4 ring-white',
            badgeClassName ?? 'bg-marianne',
            s.badge,
          )}
        >
          <Icon className={s.badgeIcon} aria-hidden="true" />
        </span>
      </div>

      <div className={cn('flex flex-1 flex-col', s.body)}>
        <p className={cn('line-clamp-2 font-display font-bold text-ink', s.name)}>{name}</p>
        {fullName && (
          <p className="mt-1 line-clamp-2 text-label-sm leading-snug text-brand">
            {fullName}
          </p>
        )}
        <p className={cn('flex-1 leading-relaxed text-muted-foreground', s.description)}>
          {description}
        </p>

        <div className="mt-4">
          {available ? (
            <Link
              to={to}
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded-sm bg-brand px-4 font-semibold text-white shadow-soft',
                'transition-colors duration-200 hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                // Stretches the hit area over the whole card — see the component note.
                'after:absolute after:inset-0 after:content-[""]',
                s.cta,
              )}
            >
              {ctaLabel}
              <ArrowRight className="size-4 shrink-0 transition-transform duration-200 group-hover/card:translate-x-1" aria-hidden="true" />
            </Link>
          ) : (
            <span
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded-sm border border-border/60 bg-surface-container px-4 font-semibold text-muted-foreground',
                s.cta,
              )}
            >
              <Lock className="size-3.5 shrink-0" aria-hidden="true" />
              Bientôt disponible
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * `ServiceCard` bound to the administrations registry (`app/config/services`).
 * Used by the public landing carousel and by `/administrations`, so the two
 * cannot drift apart.
 */
export function AdministrationCard({
  service,
  size,
}: {
  service: ServiceDefinition;
  size?: ServiceCardSize;
}) {
  return (
    <ServiceCard
      name={service.name}
      fullName={service.fullName}
      description={service.description}
      to={service.basePath}
      available={service.status === 'available'}
      icon={ADMINISTRATION_ICONS[service.id]}
      imageUrl={service.photoUrl}
      logoUrl={service.logoUrl}
      size={size}
    />
  );
}
