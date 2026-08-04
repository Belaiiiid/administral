import { Bot, Building2, Euro, Home, Leaf, ShieldCheck, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { SERVICES } from '@/app/config/services';
import { cn } from '@/lib/utils';

interface Figure {
  icon: LucideIcon;
  value: string;
  label: string;
  tone: 'brand' | 'teal';
}

/**
 * Figures shown in the ticker.
 *
 * The last three are facts about this service itself — the administration count
 * is read off the real registry (`app/config/services.ts`), so it can never
 * drift from what the site actually offers. The CAF/national figures above them
 * are the ones carried over from the reference design and still need sourcing
 * before this goes in front of citizens.
 */
const FIGURES: Figure[] = [
  { icon: Home, value: '13M+', label: 'Allocataires de la CAF', tone: 'brand' },
  { icon: Users, value: '32M+', label: 'Personnes couvertes', tone: 'brand' },
  { icon: Euro, value: '100 Md€', label: 'De prestations versées par an', tone: 'teal' },
  { icon: Home, value: '6M+', label: 'Foyers bénéficiaires de l’APL', tone: 'brand' },
  { icon: Leaf, value: '1,2 g CO2', label: 'Émis pour 400 tokens générés', tone: 'teal' },
  {
    icon: Building2,
    value: `${SERVICES.length}`,
    label: 'Administrations réunies',
    tone: 'brand',
  },
  { icon: Bot, value: '24h/24', label: 'Assistant disponible, 7j/7', tone: 'teal' },
  { icon: ShieldCheck, value: '100 %', label: 'Démarches en ligne, sans papier', tone: 'brand' },
];

function FigureItem({ figure, duplicate = false }: { figure: Figure; duplicate?: boolean }) {
  return (
    <li aria-hidden={duplicate || undefined} className="shrink-0 px-3">
      <div className="flex items-center gap-4 rounded-sm border border-border/60 bg-card px-6 py-5 shadow-soft transition-colors duration-300 hover:border-brand/40">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-sm',
            figure.tone === 'teal' ? 'bg-chart-2/10 text-chart-2' : 'bg-brand-soft text-brand',
          )}
        >
          <figure.icon className="size-5" aria-hidden="true" />
        </span>
        <span className="flex flex-col whitespace-nowrap">
          <span className="font-display text-headline-lg-mobile leading-tight tabular-nums text-ink">
            {figure.value}
          </span>
          <span className="mt-0.5 text-sm text-muted-foreground">{figure.label}</span>
        </span>
      </div>
    </li>
  );
}

/**
 * Self-scrolling figures ticker — a slim band between the hero and the services
 * carousel, not a section of its own.
 *
 * The track holds two identical copies of the list and slides by exactly half
 * its width, so the loop never shows a seam. The second copy is `aria-hidden`:
 * it is duplicated purely to make the animation continuous, and a screen reader
 * announcing every figure twice would be a regression, not a feature.
 */
export function LandingStatsMarquee() {
  return (
    <div className="relative overflow-hidden border-y border-border/60 bg-surface py-10">
      {/* Fades the items into the page edges instead of cutting them off. */}
      {/* Must match the band's own background, or the fade shows as a band edge. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-surface to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-surface to-transparent"
        aria-hidden="true"
      />

      <div className="group flex">
        <ul
          className="flex w-max animate-[marquee_45s_linear_infinite] items-center group-hover:[animation-play-state:paused]"
          aria-label="Chiffres clés"
        >
          {FIGURES.map((figure) => (
            <FigureItem key={figure.label} figure={figure} />
          ))}
          {FIGURES.map((figure) => (
            <FigureItem key={`dup-${figure.label}`} figure={figure} duplicate />
          ))}
        </ul>
      </div>
    </div>
  );
}
