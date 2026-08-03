import { useEffect, useState } from 'react';
import { ArrowRight, Grid3x3, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

import { SERVICES } from '@/app/config/services';
import { ROUTES } from '@/app/router/paths';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import type { AdministrationId } from '@/types';

/** Illustrative benefit tags shown under each service — presentation only. */
const SERVICE_SUBTAGS: Record<AdministrationId, string[]> = {
  caf: ['APL', 'AF', 'ALF', 'Prime d’activité'],
  'france-travail': ['ARE', 'Offres d’emploi', 'Formation', 'CEP'],
  'assurance-maladie': ['Carte Vitale', 'Remboursements', 'Congés maladie'],
  impots: ['Avis d’imposition', 'RFR', 'Simulateur'],
};

/**
 * "Services" carousel — structural twin of the reference design-to-code
 * services section, backed by the app's real administrations registry
 * (`app/config/services.ts`) instead of hardcoded fixtures.
 */
export function LandingServices() {
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

  return (
    <section id="services" className="bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Services principaux</p>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight text-ink">
            Vos services essentiels réunis au même endroit
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Accédez facilement aux services publics les plus utilisés. D’autres services seront
            progressivement disponibles.
          </p>
          <Link
            to={ROUTES.administrations}
            className="mt-8 inline-flex items-center gap-3 rounded-md bg-marianne px-6 py-3.5 text-sm font-semibold text-marianne-foreground transition-opacity hover:opacity-90"
          >
            Voir tous les services
            <Grid3x3 className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-14">
          <Carousel opts={{ loop: true, align: 'start' }} setApi={setApi} className="mx-auto max-w-6xl">
            <CarouselContent>
              {SERVICES.map((service) => {
                const isAvailable = service.status === 'available';
                return (
                  <CarouselItem key={service.id} className="sm:basis-1/2 lg:basis-1/3">
                    <article className="flex h-full flex-col rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg">
                      <div className="flex items-center gap-4">
                        <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-white p-2">
                          {service.logoUrl ? (
                            <img
                              src={service.logoUrl}
                              alt={service.name}
                              className="max-h-8 max-w-full object-contain"
                            />
                          ) : (
                            <span className="font-display text-xs font-bold text-brand">
                              {service.name}
                            </span>
                          )}
                        </span>
                        <div>
                          <p className="font-display text-xl font-bold text-ink">{service.name}</p>
                          <p className="text-xs text-muted-foreground">{service.administration}</p>
                        </div>
                      </div>

                      <p className="mt-5 flex-1 text-sm leading-relaxed text-muted-foreground">
                        {service.description}
                      </p>

                      <div className="mt-5">
                        <p className="text-xs font-bold uppercase tracking-wide text-brand">
                          Services {isAvailable ? 'disponibles' : 'à venir'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {SERVICE_SUBTAGS[service.id].map((item) => (
                            <span
                              key={item}
                              className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-6 border-t border-border/60 pt-4">
                        {isAvailable ? (
                          <Link
                            to={service.basePath}
                            className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
                          >
                            Accéder au service
                            <ArrowRight className="size-4" aria-hidden="true" />
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                            <Lock className="size-3.5" aria-hidden="true" />
                            Bientôt disponible
                          </span>
                        )}
                      </div>
                    </article>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            <CarouselPrevious className="hidden sm:flex" />
            <CarouselNext className="hidden sm:flex" />
          </Carousel>

          {count > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              {Array.from({ length: count }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => api?.scrollTo(i)}
                  aria-label={`Aller au groupe ${i + 1}`}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === current ? 'w-6 bg-brand' : 'w-1.5 bg-brand/20 hover:bg-brand/40',
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
