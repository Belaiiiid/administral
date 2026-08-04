import { ArrowRight, Flag, Headphones, Shield } from 'lucide-react';

import { Reveal } from '@/features/chatbot/components/landing/Reveal';

const CARD =
  'group flex h-full gap-4 rounded-sm border border-border/60 bg-surface p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-xl';
const CHIP =
  'flex size-12 shrink-0 items-center justify-center rounded-sm transition-transform duration-300 group-hover:scale-110';

/**
 * "Confiance" trio — structural twin of the reference design-to-code trust
 * section.
 */
export function LandingTrust() {
  return (
    <section id="aide" className="bg-background pb-24">
      <Reveal>
        <div className="mx-auto mb-12 max-w-2xl px-6 text-center">
          <p className="eyebrow text-sm">Aide et confiance</p>
          <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
            Un service public, avec de vraies garanties
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Vos données restent protégées et une équipe reste joignable si l’assistant ne suffit
            pas.
          </p>
        </div>
      </Reveal>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 lg:grid-cols-3">
        <Reveal delayMs={0}>
          <div className={CARD}>
            <span className={`${CHIP} bg-blue-50 text-brand`}>
              <Shield className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-lg font-bold text-ink">Sécurisé et fiable</p>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                Vos données sont protégées selon les plus hauts standards de sécurité et de
                confidentialité (RGPD).
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={90}>
          <div className={CARD}>
            <span className={`${CHIP} bg-destructive/10 text-destructive`}>
              <Flag className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-lg font-bold text-ink">République Française</p>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                Administral, une plateforme officielle au service de chaque citoyen.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={180}>
          <div className={CARD}>
            <span className={`${CHIP} bg-indigo-50 text-indigo-600`}>
              <Headphones className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-lg font-bold text-ink">Besoin d’aide ?</p>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                Consultez notre centre d’aide ou contactez nos équipes d’accompagnement.
              </p>
              <a
                href="#fonctionnalites"
                className="group/cta mt-5 inline-flex items-center gap-2 rounded-sm bg-marianne px-5 py-2.5 text-sm font-semibold text-marianne-foreground shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
              >
                Centre d’aide
                <ArrowRight
                  className="size-3.5 transition-transform duration-300 group-hover/cta:translate-x-1"
                  aria-hidden="true"
                />
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
