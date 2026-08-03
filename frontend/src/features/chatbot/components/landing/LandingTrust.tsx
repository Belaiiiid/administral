import { ArrowRight, Flag, Headphones, Shield } from 'lucide-react';

/**
 * "Confiance" trio — structural twin of the reference design-to-code trust
 * section.
 */
export function LandingTrust() {
  return (
    <section id="aide" className="bg-background pb-20">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 lg:grid-cols-3">
        <div className="flex gap-4 rounded-2xl border border-border/60 bg-surface p-6 shadow-sm transition-all duration-300 hover:border-brand/25 hover:shadow-md">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-brand">
            <Shield className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-sm font-bold text-ink">Sécurisé et fiable</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Vos données sont protégées selon les plus hauts standards de sécurité et de
              confidentialité (RGPD).
            </p>
          </div>
        </div>

        <div className="flex gap-4 rounded-2xl border border-border/60 bg-surface p-6 shadow-sm transition-all duration-300 hover:border-brand/25 hover:shadow-md">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <Flag className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-sm font-bold text-ink">République Française</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Administral, une plateforme officielle au service de chaque citoyen.
            </p>
          </div>
        </div>

        <div className="flex gap-4 rounded-2xl border border-border/60 bg-surface p-6 shadow-sm transition-all duration-300 hover:border-brand/25 hover:shadow-md">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Headphones className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-sm font-bold text-ink">Besoin d’aide ?</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Consultez notre centre d’aide ou contactez nos équipes d’accompagnement.
            </p>
            <a
              href="#fonctionnalites"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-marianne px-4 py-2.5 text-xs font-semibold text-marianne-foreground transition-opacity hover:opacity-90"
            >
              Centre d’aide
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
