import { MessageCircle, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import heroImage from '@/assets/hero-republique.png';

interface LandingHeroProps {
  /** Starts the embedded assistant in text mode — see `PublicLandingPage`. */
  onStart: () => void;
}

/**
 * Administral-styled hero — a single text column over the institutional photo.
 *
 * The rotating vision/stats card that used to sit in a right column now lives
 * in its own band below (`LandingKeyFigures`), so the hero carries one message
 * instead of competing with a second one beside it.
 *
 * The CTA is wired to this app's real behaviour: the embedded assistant starts
 * in place rather than navigating away (see `PublicLandingPage`'s "assistant
 * first" rationale).
 */
export function LandingHero({ onStart }: LandingHeroProps) {
  return (
    <section className="relative overflow-hidden">
      <img
        src={heroImage}
        alt="Bureau institutionnel avec vue sur un bâtiment officiel français et le drapeau tricolore"
        width={1080}
        height={602}
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-background via-background/85 to-transparent lg:w-3/5" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />

      {/* Full first screen: the viewport minus the 5rem header. */}
      <div className="relative mx-auto flex max-w-7xl items-center px-6 py-20 lg:min-h-[calc(100vh-5rem)] lg:py-24">
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
          <span className="inline-flex rounded-full bg-brand-soft px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
            Bienvenue sur Administral
          </span>
          <h1 className="mt-6 max-w-2xl font-display text-3xl font-extrabold leading-[1.1] text-ink sm:text-4xl lg:text-5xl">
            Simplifiez vos démarches. Centralisez vos services.
          </h1>

          {/* The project's premise, stated once and early — everything below
              assumes the reader knows what "République 5.0" means. */}
          <p className="mt-6 max-w-xl border-l-[3px] border-brand pl-4 text-base leading-relaxed text-ink/90 sm:text-lg">
            <span className="font-display font-extrabold text-ink">République 5.0</span> — une
            administration augmentée par le numérique et l’IA : plus simple, plus rapide, accessible
            à tous.
          </p>

          {/* `text-ink/85` rather than `muted-foreground`: this paragraph sits on
              the photo, where the muted grey lost too much contrast. */}
          <p className="mt-5 max-w-xl text-base font-medium leading-relaxed text-ink/85">
            Administral centralise vos démarches administratives au sein d’un espace unique. Accédez
            facilement aux services de la CAF, de l’APL, de France Travail et à de nombreux autres
            services publics, avec un accompagnement intelligent disponible partout et à tout moment.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-sm bg-marianne px-6 py-3.5 text-sm font-semibold text-marianne-foreground shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-marianne/25"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Commencer ma démarche
            </button>
            <Link
              to={ROUTES.register}
              className="inline-flex items-center gap-2 rounded-sm border border-brand/40 bg-background px-6 py-3.5 text-sm font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:border-brand hover:bg-brand-soft hover:shadow-lg"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Créer un compte
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
