import { useEffect, useState } from 'react';
import { Euro, Home, Leaf, MessageCircle, Sparkles, UserPlus, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import heroImage from '@/assets/hero-republique.png';
import { cn } from '@/lib/utils';

type HeroSlide =
  | { type: 'vision' }
  | { type: 'stat'; icon: LucideIcon; value: string; label: string; tone: 'brand' | 'teal' };

const HERO_SLIDES: HeroSlide[] = [
  { type: 'vision' },
  { type: 'stat', icon: Home, value: '13M+', label: 'D’allocataires de la CAF', tone: 'brand' },
  { type: 'stat', icon: Users, value: '32M+', label: 'De personnes couvertes', tone: 'brand' },
  { type: 'stat', icon: Euro, value: '100 Md€', label: 'De prestations versées chaque année', tone: 'teal' },
  { type: 'stat', icon: Home, value: '6M+', label: 'Foyers bénéficiaires de l’APL', tone: 'brand' },
  { type: 'stat', icon: Leaf, value: '1,2 g CO2', label: 'Émis pour 400 tokens générés par l’IA', tone: 'teal' },
];

interface LandingHeroProps {
  /** Starts the embedded assistant in text mode — see `PublicLandingPage`. */
  onStart: () => void;
}

/**
 * Administral-styled hero — structural twin of the reference design-to-code
 * hero (rotating vision/stats card), with the CTA wired to this app's real
 * behaviour: the embedded assistant starts in place rather than navigating
 * away (see `PublicLandingPage`'s "assistant first" rationale).
 */
export function LandingHero({ onStart }: LandingHeroProps) {
  const [slide, setSlide] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setSlide((s) => (s + 1) % HERO_SLIDES.length);
        setIsVisible(true);
      }, 250);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const goToSlide = (index: number) => {
    if (index === slide) return;
    setIsVisible(false);
    setTimeout(() => {
      setSlide(index);
      setIsVisible(true);
    }, 250);
  };

  const current = HERO_SLIDES[slide]!;

  return (
    <section className="relative overflow-hidden">
      <img
        src={heroImage}
        alt="Bureau institutionnel avec vue sur un bâtiment officiel français et le drapeau tricolore"
        width={1080}
        height={602}
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-background via-background/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
        <div>
          <span className="inline-flex rounded-full bg-brand-soft px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
            Bienvenue sur Administral
          </span>
          <h1 className="mt-6 max-w-2xl font-display text-4xl font-extrabold leading-[1.08] text-ink sm:text-5xl lg:text-6xl">
            Une plateforme unique pour vos démarches et services publics.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
            Administral simplifie vos démarches administratives et vous accompagne au quotidien
            grâce à l’intelligence artificielle et à des services accessibles partout, à tout
            moment.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-md bg-marianne px-6 py-3.5 text-sm font-semibold text-marianne-foreground transition-opacity hover:opacity-90"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Commencer ma démarche
            </button>
            <Link
              to={ROUTES.register}
              className="inline-flex items-center gap-2 rounded-md border border-brand/40 bg-background px-6 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-brand-soft"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Créer un compte
            </Link>
          </div>
        </div>

        <div className="lg:pt-6">
          <div className="relative min-h-[24rem] overflow-hidden rounded-2xl border border-brand/20 bg-white/90 p-6 shadow-lg backdrop-blur-sm sm:p-8">
            <div className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full bg-brand/5 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-14 -left-10 size-36 rounded-full bg-chart-2/5 blur-3xl" />

            <div
              className={`relative transition-all duration-300 ease-out ${
                isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
              }`}
            >
              {current.type === 'vision' ? (
                <div>
                  <h2 className="font-display text-3xl font-extrabold text-ink lg:text-4xl">
                    RÉPUBLIQUE 5.0
                  </h2>
                  <p className="mt-3 font-display text-lg font-semibold leading-snug text-brand">
                    Connectée. Inclusive.
                    <br />
                    Intelligente. Humaine.
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    Une République augmentée par la technologie au service de tous les citoyens,
                    pour une administration plus simple, plus rapide et plus juste.
                  </p>

                  <div className="mt-8 flex gap-4 rounded-xl bg-brand-soft/60 p-5">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-background text-brand shadow-sm">
                      <Sparkles className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-display text-sm font-bold text-ink">Notre vision</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        Une administration proactive, personnalisée et accessible à tous, grâce au
                        numérique et à l’IA.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 text-center">
                  <span
                    className={cn(
                      'flex size-14 shrink-0 items-center justify-center rounded-xl',
                      current.tone === 'teal'
                        ? 'bg-teal-50 text-chart-2'
                        : 'bg-brand-soft text-brand',
                    )}
                  >
                    <current.icon className="size-7" aria-hidden="true" />
                  </span>
                  <p className="eyebrow mt-5">Chiffres clés</p>

                  <p className="mt-4 font-display text-5xl font-extrabold leading-none tabular-nums text-ink sm:text-6xl">
                    {current.value}
                  </p>
                  <span
                    className={cn(
                      'mt-5 block h-1 w-12 rounded-full',
                      current.tone === 'teal' ? 'bg-chart-2' : 'bg-brand',
                    )}
                    aria-hidden="true"
                  />
                  <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">
                    {current.label}
                  </p>
                </div>
              )}
            </div>

            <div className="relative mt-8 flex items-center justify-center gap-2">
              {HERO_SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goToSlide(i)}
                  aria-label={`Aller à la diapositive ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
                    i === slide ? 'w-6 bg-brand' : 'w-1.5 bg-brand/20 hover:bg-brand/40'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
