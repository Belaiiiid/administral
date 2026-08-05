import { useCallback, useEffect, useState } from 'react';
import {
  Atom,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  Microscope,
  Pause,
  Play,
  Rocket,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { Reveal } from '@/features/chatbot/components/landing/Reveal';
import { cn } from '@/lib/utils';

interface Innovation {
  id: string;
  title: string;
  /** One-line kicker under the title. */
  subtitle: string;
  description: string;
  icon: LucideIcon;
  /** Flat tint standing in for artwork — see `imageUrl`. */
  panel: string;
  /** Colour of the oversized icon drawn on that tint. */
  watermark: string;
  /** Round chip behind the icon, in the card body. */
  chip: string;
  /**
   * Artwork for the 4:3 panel (`public/innovations/`). The source visuals are
   * square infographics re-encoded to WebP at 900px — 10.6 Mo of PNG for one
   * section was more than the rest of the landing page put together.
   *
   * Optional: clearing it falls back to the card's own icon on `panel`, the
   * same placeholder `ServiceCard` uses.
   */
  imageUrl?: string;
}

const INNOVATIONS: Innovation[] = [
  {
    id: 'ariane-6',
    title: 'Ariane 6',
    subtitle: 'L’Europe vers l’espace',
    description:
      'Le nouveau lanceur européen développé avec une forte contribution française, garantissant un accès autonome à l’espace.',
    icon: Rocket,
    imageUrl: '/innovations/ariane-6.webp',
    panel: 'bg-brand-soft',
    watermark: 'text-brand',
    chip: 'bg-brand-soft text-brand',
  },
  {
    id: 'mistral-ai',
    title: 'Mistral AI',
    subtitle: 'L’IA française qui rivalise avec les géants américains',
    description:
      'Fondée par d’anciens chercheurs de DeepMind et Meta, Mistral AI est devenue en quelques années un des champions mondiaux de l’intelligence artificielle générative.',
    icon: Sparkles,
    imageUrl: '/innovations/mistral-ai.webp',
    panel: 'bg-destructive-surface',
    watermark: 'text-destructive',
    chip: 'bg-destructive-surface text-destructive',
  },
  {
    id: 'station-f',
    title: 'Station F',
    subtitle: 'Le plus grand campus de startups',
    description:
      'À Paris, Station F rassemble les meilleurs talents et startups pour réinventer le futur dans tous les domaines.',
    icon: Building2,
    imageUrl: '/innovations/station-f.webp',
    panel: 'bg-success-surface',
    watermark: 'text-success',
    chip: 'bg-success-surface text-success',
  },
  {
    id: 'recherche',
    title: 'Recherche française',
    subtitle: 'Une science au service de l’innovation',
    description:
      'Le CNRS, le CEA, Inria et de nombreux laboratoires font rayonner l’excellence scientifique française dans le monde.',
    icon: Microscope,
    imageUrl: '/innovations/recherche.webp',
    panel: 'bg-surface-container',
    watermark: 'text-ink',
    chip: 'bg-surface-container text-ink',
  },
  {
    id: 'quantique',
    title: 'Informatique quantique',
    subtitle: 'La France mise sur le calcul de demain',
    description:
      'Un plan national ambitieux pour faire émerger des champions du quantique dans la finance, la santé et l’industrie.',
    // Même bleu pâle qu'Ariane 6 : les jetons de tint sûrs sont limités (les
    // couleurs `oklch(...)` ignorent le modificateur d'opacité de Tailwind).
    // Le filigrane bleu marine et l'icône distinguent les deux panneaux.
    icon: Atom,
    imageUrl: '/innovations/quantique.webp',
    panel: 'bg-brand-soft',
    watermark: 'text-ai',
    chip: 'bg-brand-soft text-ai',
  },
];

/**
 * Destination of the section's call-to-action. Points at the government's own
 * innovation programme for now — swap it for an internal route if one appears.
 */
const DISCOVER_URL = 'https://www.france2030.gouv.fr/';

/** Cadence du défilement automatique. */
const AUTOPLAY_MS = 5000;

const ARROW =
  'inline-flex size-10 items-center justify-center rounded-full border border-border/60 bg-card text-ink shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

/**
 * « La France qui innove » — a fixed presentation column on the left, a
 * horizontal carousel of innovations on the right.
 *
 * Built on the same Embla `Carousel` primitives as `LandingServices` (arrows,
 * dots, swipe on touch) rather than a second scroller, so the two sections
 * behave identically. The arrows are local buttons instead of
 * `CarouselPrevious`/`CarouselNext`: those position themselves *outside* the
 * viewport edges, which here would land on top of the left-hand column.
 */
export function LandingInnovation() {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    const update = () => {
      setCount(api.scrollSnapList().length);
      setCurrent(api.selectedScrollSnap());
    };
    update();
    api.on('select', update);
    api.on('reInit', update);
    return () => {
      api.off('select', update);
      api.off('reInit', update);
    };
  }, [api]);

  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);

  // ── Défilement automatique ────────────────────────────────────────
  //
  // `setInterval` sur l'API Embla plutôt que `embla-carousel-autoplay` : le
  // greffon n'est pas installé, et la mise en pause dont on a besoin ici
  // (survol, focus clavier, bouton explicite) tient en trois lignes.
  /** Préférence du visiteur — le bouton pause/lecture. */
  const [playing, setPlaying] = useState(true);
  /** Suspension temporaire : survol souris ou focus clavier dans le carousel. */
  const [suspended, setSuspended] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    // Un citoyen qui demande moins de mouvement ne doit pas voir la section
    // avancer toute seule : le carousel reste entièrement manuel.
    if (!api || !playing || suspended || reducedMotion) return;
    const timer = window.setInterval(() => api.scrollNext(), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [api, playing, suspended, reducedMotion]);

  return (
    // `overflow-hidden` : les `Reveal` internes partent décalés de 8px sur les
    // côtés, ce qui ferait apparaître une barre de défilement horizontale sur
    // toute la page tant que la section n'est pas révélée.
    <section id="innovation" className="overflow-hidden bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          {/* ── Colonne de présentation ─────────────────────────────── */}
          <Reveal from="left">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-card px-4 py-2 shadow-soft">
              <Lightbulb className="size-4 text-brand" aria-hidden="true" />
              <span className="eyebrow text-xs">Innovation française</span>
            </span>

            <h2 className="mt-5 font-display text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
              La France qui innove
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              De l’espace au quantique, la France conçoit les technologies qui façonnent demain.
              Un aperçu des projets qui font rayonner son excellence.
            </p>

            <a
              href={DISCOVER_URL}
              target="_blank"
              rel="noreferrer"
              className="group/cta mt-8 inline-flex items-center gap-2.5 rounded-sm bg-marianne px-6 py-3.5 text-label-md text-marianne-foreground shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Découvrir la France qui innove
              <ExternalLink
                className="size-4 transition-transform duration-300 group-hover/cta:translate-x-0.5"
                aria-hidden="true"
              />
              <span className="sr-only">(nouvelle fenêtre)</span>
            </a>
          </Reveal>

          {/* ── Carousel ────────────────────────────────────────────── */}
          <Reveal from="right">
            {/* Le défilement se suspend tant que la souris est sur le carousel
                ou qu'un de ses éléments a le focus clavier — sinon la carte
                qu'on est en train de lire disparaît sous le curseur. */}
            <div
              onMouseEnter={() => setSuspended(true)}
              onMouseLeave={() => setSuspended(false)}
              onFocusCapture={() => setSuspended(true)}
              onBlurCapture={() => setSuspended(false)}
            >
              <Carousel
                opts={{ loop: true, align: 'start' }}
                setApi={setApi}
                aria-label="La France qui innove"
              >
                {/* `group/cards` lets a hovered card dim its siblings, as on the
                    services carousel — the highlight reads as "this one". */}
                <CarouselContent className="group/cards -ml-5 py-2">
                  {INNOVATIONS.map((item, index) => (
                    <CarouselItem
                      key={item.id}
                      aria-label={`${index + 1} sur ${INNOVATIONS.length} : ${item.title}`}
                      className="pl-5 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
                    >
                      <InnovationCard item={item} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>

              {/* Pastilles à gauche, contrôles à droite — une seule rangée sous
                  le carousel, pour ne pas empiéter sur la colonne de gauche. */}
              <div className="mt-8 flex items-center justify-between gap-6">
                <div className="flex gap-2">
                  {count > 1 &&
                    Array.from({ length: count }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => api?.scrollTo(i)}
                        aria-label={`Aller au groupe ${i + 1}`}
                        aria-current={i === current}
                        className={cn(
                          // `opacity-*` plutôt que `bg-brand/*` : `--admtl-brand`
                          // est injecté tel quel dans la classe utilitaire, et
                          // Tailwind ne sait pas y appliquer un modificateur
                          // d'opacité — la règle serait purement et simplement
                          // absente de la feuille de style produite.
                          'h-1.5 rounded-full bg-brand transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                          i === current ? 'w-6 opacity-100' : 'w-1.5 opacity-30 hover:opacity-70',
                        )}
                      />
                    ))}
                </div>

                <div className="flex gap-3">
                  {/* Le survol et le focus ne suspendent le défilement que le
                      temps qu'ils durent : au clavier comme sur mobile, il faut
                      aussi pouvoir l'arrêter pour de bon (WCAG 2.2.2). Inutile
                      quand `prefers-reduced-motion` a déjà tout immobilisé. */}
                  {!reducedMotion && (
                    <button
                      type="button"
                      onClick={() => setPlaying((value) => !value)}
                      aria-label={
                        playing
                          ? 'Arrêter le défilement automatique'
                          : 'Reprendre le défilement automatique'
                      }
                      aria-pressed={!playing}
                      className={ARROW}
                    >
                      {playing ? (
                        <Pause className="size-4" aria-hidden="true" />
                      ) : (
                        <Play className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={scrollPrev}
                    aria-label="Innovation précédente"
                    className={ARROW}
                  >
                    <ChevronLeft className="size-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={scrollNext}
                    aria-label="Innovation suivante"
                    className={ARROW}
                  >
                    <ChevronRight className="size-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function InnovationCard({ item }: { item: Innovation }) {
  const Icon = item.icon;

  return (
    <article
      className={cn(
        'group/card flex h-full flex-col overflow-hidden rounded-sm border border-border/60 bg-card shadow-soft',
        'transition-all duration-300 ease-out',
        'group-hover/cards:opacity-60 hover:!opacity-100 hover:-translate-y-1 hover:border-brand hover:shadow-soft-hover',
      )}
    >
      {/* Vignette carrée plutôt que `4/3` : elle gagne un tiers de hauteur sans
          changer la largeur de la carte — c'est l'image qui porte la section. */}
      <div className={cn('relative aspect-square w-full overflow-hidden', item.panel)}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
          />
        ) : (
          // `opacity-25` plutôt que `text-ink/25` : plusieurs jetons de couleur
          // sont des `oklch(...)` complets, sur lesquels le modificateur
          // d'opacité de Tailwind est sans effet (cf. ServiceCard).
          <Icon
            className={cn(
              'absolute inset-0 m-auto size-14 opacity-40 transition-transform duration-500 ease-out group-hover/card:scale-110',
              item.watermark,
            )}
            strokeWidth={1.25}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover/card:scale-110',
              item.chip,
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <h3 className="font-display text-base font-bold leading-tight text-ink">{item.title}</h3>
        </div>

        <p className="mt-2.5 line-clamp-2 text-label-sm leading-snug text-muted-foreground">
          {item.subtitle}
        </p>
        {/* Toutes les cartes s'alignent sur la plus haute : sans limite, les
            trois lignes de « Mistral AI » en devenaient sept sur une carte de
            ~210px et étiraient les quatre autres avec elles. Le texte complet
            reste dans le visuel de la carte. */}
        <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      </div>
    </article>
  );
}
