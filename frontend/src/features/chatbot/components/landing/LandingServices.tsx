import { useEffect, useState } from 'react';
import { ArrowRight, Briefcase, HeartPulse, Home, Lock, Receipt } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

/** One recognisable icon per administration for the badge overlapping the photo panel. */
const ADMINISTRATION_ICONS: Record<AdministrationId, LucideIcon> = {
  caf: Home,
  'france-travail': Briefcase,
  'assurance-maladie': HeartPulse,
  impots: Receipt,
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
    // `bg-neutral-50` rather than `bg-surface`: the `--surface` token carries a
    // slight blue chroma (oklch hue 250), which read as a blue tint over a full
    // section. This is a genuinely neutral light grey.
    <section id="services" className="bg-neutral-50">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow text-base">Services principaux</p>
          <h2 className="mt-4 text-5xl font-extrabold leading-tight text-ink">
            Vos services essentiels réunis au même endroit
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Accédez facilement aux services publics les plus utilisés. D’autres services seront
            progressivement disponibles.
          </p>
        </div>

        <div className="mt-14">
          <Carousel
            opts={{ loop: true, align: 'start' }}
            setApi={setApi}
            aria-label="Services principaux"
            className="mx-auto max-w-6xl"
          >
            {/* `group/cards` lets a hovered card dim its siblings — the highlight
                reads as "this one" rather than just "something moved". */}
            <CarouselContent className="group/cards -ml-6 py-2">
              {SERVICES.map((service, index) => {
                const isAvailable = service.status === 'available';
                const Icon = ADMINISTRATION_ICONS[service.id];
                const accentSolid = 'bg-[#132a6e]';
                const panelTint = isAvailable ? 'bg-brand-soft' : 'bg-destructive-surface';

                return (
                  <CarouselItem
                    key={service.id}
                    aria-label={`${index + 1} sur ${SERVICES.length} : ${service.name}`}
                    className="pl-6 sm:basis-1/2 lg:basis-1/3"
                  >
                    <article
                      className={cn(
                        'group/card flex h-full flex-col overflow-hidden rounded-sm border-2 border-border/60 bg-card shadow-sm',
                        'transition-all duration-300 ease-out',
                        // Siblings recede while any card in the row is hovered…
                        'group-hover/cards:scale-[0.97] group-hover/cards:opacity-50',
                        // …and the hovered one wins both back, plus a brand border.
                        'hover:!scale-[1.03] hover:!opacity-100 hover:border-brand hover:shadow-2xl hover:shadow-brand/10',
                      )}
                    >
                      <div className={cn('relative h-56 w-full shrink-0', panelTint)}>
                        {service.photoUrl ? (
                          <img
                            src={service.photoUrl}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
                          />
                        ) : service.logoUrl ? (
                          <img
                            src={service.logoUrl}
                            alt={service.name}
                            className="absolute inset-0 m-auto max-h-16 max-w-[70%] object-contain"
                          />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold text-brand">
                            {service.name}
                          </span>
                        )}

                        <span
                          className={cn(
                            'absolute bottom-0 left-6 z-10 flex size-14 translate-y-1/2 items-center justify-center rounded-full text-white shadow-md ring-4 ring-white',
                            accentSolid,
                          )}
                        >
                          <Icon className="size-6" aria-hidden="true" />
                        </span>
                      </div>

                      <div className="flex flex-1 flex-col p-6 pt-8">
                        <p className="line-clamp-2 font-display text-xl font-bold text-ink">
                          {service.name}
                        </p>
                        {service.fullName && (
                          <p className="mt-1 text-sm font-semibold leading-snug text-brand">
                            {service.fullName}
                          </p>
                        )}
                        <p className="mt-2 line-clamp-6 flex-1 text-base leading-relaxed text-muted-foreground sm:line-clamp-4">
                          {service.description}
                        </p>

                        <div className="mt-4 border-t border-border/60 pt-4">
                          {isAvailable ? (
                            <Link
                              to={service.basePath}
                              className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
                            >
                              Accéder au service
                              <ArrowRight className="size-4" aria-hidden="true" />
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-destructive">
                              <Lock className="size-3.5" aria-hidden="true" />
                              Bientôt disponible
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            <CarouselPrevious className="-left-4 hidden sm:flex sm:-left-16" />
            <CarouselNext className="-right-4 hidden sm:flex sm:-right-16" />
          </Carousel>

          {count > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              {Array.from({ length: count }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => api?.scrollTo(i)}
                  aria-label={`Aller au groupe ${i + 1}`}
                  aria-current={i === current}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === current ? 'w-6 bg-brand' : 'w-1.5 bg-brand/20 hover:bg-brand/40',
                  )}
                />
              ))}
            </div>
          )}

          <div className="mt-10 flex justify-center">
            <Link
              to={ROUTES.administrations}
              className="inline-flex items-center gap-3 rounded-sm bg-marianne px-7 py-4 text-base font-semibold text-marianne-foreground transition-opacity hover:opacity-90"
            >
              Voir tous les services
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
