import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { CitizenCard } from '@/components/citizen/CitizenCard';
import { cn } from '@/lib/utils';

/**
 * Vocabulaire visuel propre à France Travail.
 *
 * Le reste de l'espace citoyen empile des cartes blanches sur fond blanc :
 * lisible, mais plat, et sans repère de progression sur des pages qui sont en
 * réalité des parcours en plusieurs temps. Ces pièces ajoutent la hiérarchie
 * qui manquait — rail d'étapes numérotées, score qui s'anime, sections qui se
 * démarquent — sans toucher aux composants partagés.
 *
 * Tout passe par les tokens de la charte (docs/design-system.md) : aucune
 * couleur en dur, `shadow-soft` / `shadow-soft-hover` pour seules ombres,
 * `duration-200` + `ease-standard` pour le mouvement, et l'échelle typo du §4.2.
 */

const ACCENTS = {
  brand: 'before:bg-brand',
  success: 'before:bg-success',
  warning: 'before:bg-warning',
  chart: 'before:bg-chart-2',
} as const;

/**
 * Carte France Travail — `CitizenCard` ramenée au rayon des cartes (12px,
 * `rounded-xl` §6.1) au lieu du `rounded-2xl` réservé aux grands conteneurs.
 */
export function FtCard({
  children,
  className,
  interactive = false,
  /** Filet coloré en haut de carte, pour typer un bloc de résultat. */
  accent,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  accent?: keyof typeof ACCENTS;
}) {
  return (
    <CitizenCard
      interactive={interactive}
      className={cn(
        'rounded-xl shadow-soft',
        interactive && 'hover:shadow-soft-hover',
        accent &&
          cn(
            'relative before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-[""]',
            ACCENTS[accent],
          ),
        className,
      )}
    >
      {children}
    </CitizenCard>
  );
}

/**
 * Étape numérotée d'un parcours, reliée à la suivante par un rail vertical.
 * Le numéro est décoratif — le titre porte déjà l'information — et le rail
 * disparaît sous `sm`, où il n'y a plus la place.
 */
export function FtStep({
  index,
  title,
  eyebrow,
  children,
  isLast = false,
  done = false,
}: {
  index: number;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  isLast?: boolean;
  done?: boolean;
}) {
  return (
    <div className="relative sm:pl-16">
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-6 top-16 hidden w-px bg-border-strong sm:block"
          style={{ height: 'calc(100% - 2rem)' }}
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-5 hidden size-12 items-center justify-center rounded-full border-2 font-display text-headline-md shadow-soft transition-colors duration-200 ease-standard sm:flex',
          done
            ? 'border-brand bg-brand text-marianne-foreground'
            : 'border-border-strong bg-card text-brand',
        )}
      >
        {index}
      </span>

      <FtCard className="p-6">
        {eyebrow && <p className="eyebrow sm:hidden">{eyebrow}</p>}
        <h2 className="font-display text-headline-md text-ink max-sm:mt-2">{title}</h2>
        <div className="mt-6">{children}</div>
      </FtCard>
    </div>
  );
}

/**
 * Le décompte est en JavaScript, donc `prefers-reduced-motion` et
 * `.a11y-reduced-motion` ne l'atteignent pas d'eux-mêmes (charte §6.3) : la
 * préférence est lue explicitement, et le score s'affiche alors d'un coup.
 */
function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.classList.contains('a11y-reduced-motion') ||
    document.body.classList.contains('a11y-reduced-motion')
  );
}

/**
 * Score en gros chiffre : le nombre se compte à l'affichage et la barre se
 * remplit en même temps. L'animation dit « ce résultat vient d'être calculé »
 * là où un chiffre posé d'un coup ne raconte rien.
 */
export function FtScore({ value, label }: { value: number | null; label: string }) {
  const target = value ?? 0;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (value === null) {
      setShown(0);
      return;
    }
    if (prefersReducedMotion()) {
      setShown(target);
      return;
    }
    let frame = 0;
    const steps = 24;
    const id = window.setInterval(() => {
      frame += 1;
      // Ease-out : rapide au départ, ralentit près de la valeur finale.
      const progress = 1 - Math.pow(1 - frame / steps, 3);
      setShown(Math.round(target * progress));
      if (frame >= steps) window.clearInterval(id);
    }, 20);
    return () => window.clearInterval(id);
  }, [value, target]);

  const bar = target >= 66 ? 'bg-success' : target >= 33 ? 'bg-brand' : 'bg-warning';

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-display tabular-nums text-ink">
          {value === null ? '—' : shown}
        </span>
        {value !== null && (
          <span className="text-headline-md text-on-surface-variant">%</span>
        )}
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-container">
        <div
          className={cn('h-full rounded-full transition-[width] duration-200 ease-standard', bar)}
          style={{ width: `${value === null ? 0 : shown}%` }}
        />
      </div>
      <p className="mt-3 text-label-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Encart du bandeau — la carte posée à droite, sur la photo.
 *
 * Elle était jusqu'ici un aplat blanc sans rapport avec l'image, et chaque
 * page en dessinait une différente. Trois choses la rattachent maintenant au
 * fond : une surface translucide (`card-veil`, dont l'alpha est porté par le
 * token) avec flou d'arrière-plan, un liseré de marque sur le bord gauche, et
 * une pastille d'icône colorée qui donne le même point d'entrée aux trois
 * pages.
 *
 * `value` sert aux encarts qui portent un chiffre. Rien ne s'affiche tant
 * qu'il n'y en a pas — un tiret de remplacement en gros corps se lisait comme
 * une coquille.
 */
export function FtAside({
  icon: Icon,
  tone = 'brand',
  title,
  description,
  value,
  children,
}: {
  icon: LucideIcon;
  tone?: 'brand' | 'chart';
  title: string;
  description?: string;
  value?: number | null;
  children?: ReactNode;
}) {
  const tones = {
    brand: { chip: 'bg-brand text-marianne-foreground', rule: 'bg-brand' },
    chart: { chip: 'bg-chart-2 text-marianne-foreground', rule: 'bg-chart-2' },
  } as const;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card-veil shadow-soft backdrop-blur-md">
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', tones[tone].rule)} />

      <div className="p-6 pl-7">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl shadow-soft',
            tones[tone].chip,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>

        {/*
          Le chiffre reste en `ink` et non dans la couleur de ton : à travers
          un voile à 82 % posé sur une photo sombre, `chart-2` retombe à
          2,4:1, sous le seuil de 3:1 des gros caractères. La couleur passe
          par la pastille et le liseré, qui ont leur propre fond opaque.
        */}
        {typeof value === 'number' && (
          <p className="mt-5 font-display text-display tabular-nums text-ink">{value}</p>
        )}

        <p className="mt-4 font-display text-headline-md text-ink">{title}</p>
        {description && (
          <p className="mt-2 text-body-sm text-on-surface-variant">{description}</p>
        )}

        {children && <div className="mt-5 border-t border-border pt-5">{children}</div>}
      </div>
    </div>
  );
}

/** Titre de section avec filet de séparation — sépare deux blocs sans carte. */
export function FtSectionHeading({
  eyebrow,
  title,
  icon: Icon,
  action,
}: {
  eyebrow: string;
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="flex items-center gap-4">
        {Icon && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        )}
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-1.5 font-display text-headline-lg text-ink">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * Entrée en fondu décalée — donne un ordre de lecture aux listes de résultats.
 * Purement CSS, donc déjà neutralisée par `.a11y-reduced-motion`.
 */
export function FtReveal({
  index = 0,
  children,
  className,
}: {
  index?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards', className)}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms`, animationDuration: '200ms' }}
    >
      {children}
    </div>
  );
}
