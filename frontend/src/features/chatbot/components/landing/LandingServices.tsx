import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { SERVICES } from '@/app/config/services';
import { ROUTES } from '@/app/router/paths';
import { AdministrationCard } from '@/components/citizen/ServiceCard';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

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
              {SERVICES.map((service, index) => (
                <CarouselItem
                  key={service.id}
                  aria-label={`${index + 1} sur ${SERVICES.length} : ${service.name}`}
                  className="pl-6 sm:basis-1/2 lg:basis-1/3"
                >
                  <AdministrationCard service={service} />
                </CarouselItem>
              ))}
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
