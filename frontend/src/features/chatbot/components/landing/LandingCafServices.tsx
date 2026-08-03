import { ArrowRight, Banknote, Building2, Home, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CAF_SERVICES, type CafServiceId } from '@/app/config/cafServices';
import { cn } from '@/lib/utils';

const CAF_SERVICE_ICONS: Record<CafServiceId, LucideIcon> = {
  apl: Home,
  af: Users,
  alf: Building2,
  'prime-activite': Banknote,
};

const CAF_SERVICE_TONE: Record<CafServiceId, { chip: string; cta: string; featured: boolean }> = {
  apl: { chip: 'bg-brand text-marianne-foreground', cta: 'bg-brand text-marianne-foreground hover:opacity-90', featured: true },
  af: { chip: 'bg-pink-600 text-white', cta: 'border border-border hover:bg-brand-soft', featured: false },
  alf: { chip: 'bg-purple-600 text-white', cta: 'border border-border hover:bg-brand-soft', featured: false },
  'prime-activite': { chip: 'bg-emerald-600 text-white', cta: 'border border-border hover:bg-brand-soft', featured: false },
};

/**
 * "Services CAF" — structural twin of the reference design-to-code CAF
 * services section, backed by the app's real `CAF_SERVICES` registry.
 */
export function LandingCafServices() {
  return (
    <section id="services-caf" className="border-y border-border/60 bg-card">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3.5 py-1 text-xs font-bold uppercase text-brand">
            <Home className="size-3.5" aria-hidden="true" />
            Administration CAF
          </span>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
            Les 4 services officiels de la CAF
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Effectuez vos démarches d’aide financière et de logement accompagnées par l’assistant
            IA.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CAF_SERVICES.map((service) => {
            const Icon = CAF_SERVICE_ICONS[service.id];
            const tone = CAF_SERVICE_TONE[service.id];
            const isAvailable = service.status === 'available';

            return (
              <article
                key={service.id}
                className={cn(
                  'relative flex flex-col justify-between rounded-2xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg',
                  tone.featured
                    ? 'border-2 border-brand bg-surface'
                    : 'border border-border/60 bg-surface hover:border-brand/30',
                )}
              >
                {tone.featured && (
                  <span className="absolute right-0 top-0 rounded-bl-xl rounded-tr-2xl bg-brand px-3 py-1 text-[9px] font-extrabold uppercase text-marianne-foreground">
                    {service.id}
                  </span>
                )}
                <div>
                  <span className={cn('flex size-10 items-center justify-center rounded-xl', tone.chip)}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <p className="mt-3 font-display text-xl font-extrabold text-ink">{service.name}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Service CAF</p>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{service.description}</p>
                </div>
                {isAvailable ? (
                  <Link
                    to={service.basePath}
                    className={cn(
                      'mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all',
                      tone.cta,
                    )}
                  >
                    Découvrir
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs font-bold text-muted-foreground">
                    Bientôt disponible
                  </span>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
