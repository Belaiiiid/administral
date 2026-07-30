import { ArrowRight, Landmark } from 'lucide-react';
import { Link } from 'react-router-dom';

import { SERVICES } from '@/app/config/services';
import { PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSessionStore } from '@/store/sessionStore';

/**
 * "Mes services" — the first thing a citizen sees after registering, and the
 * landing page for every later visit. No profile gate here any more: the
 * questions to ask depend on *which* service is opened (APL's are not
 * France Travail's), so profiling now happens per service, on entering it
 * (see `RequireApplProfile`), not once globally before this hub even shows.
 *
 * Only `caf` (APL) is wired to a real backend; the rest render as disabled
 * tiles rather than pretending to be functional.
 */
export default function CitizenDashboardPage() {
  useDocumentTitle('Mes services');
  const { displayName } = useSessionStore();

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Mes services"
        description={
          displayName
            ? `Bienvenue ${displayName}, choisissez le service que vous souhaitez utiliser.`
            : 'Choisissez le service que vous souhaitez utiliser.'
        }
      />

      <SectionHeader title="Services publics" as="h2" className="mb-4" />
      <ul className="grid gap-4 sm:grid-cols-2">
        {SERVICES.map((service) => {
          const isAvailable = service.status === 'available';
          const content = (
            <Card
              className={
                isAvailable
                  ? 'h-full transition-colors hover:border-primary'
                  : 'h-full opacity-60'
              }
            >
              <CardContent className="flex h-full flex-col gap-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                    <Landmark className="size-6" aria-hidden="true" />
                  </span>
                  {!isAvailable && <Badge tone="neutral">Bientôt disponible</Badge>}
                </div>
                <div className="flex-1">
                  <h3 className="text-headline-md text-primary">{service.name}</h3>
                  <p className="mt-1 text-body-sm text-on-surface-variant">
                    {service.description}
                  </p>
                </div>
                {/* Always reserved, just hidden when unavailable — every card keeps
                    the same height instead of the grid's rows sizing unevenly
                    depending on which services happen to share one. */}
                <span
                  className={
                    isAvailable
                      ? 'flex items-center gap-1 text-label-md text-primary'
                      : 'invisible flex items-center gap-1 text-label-md'
                  }
                  aria-hidden={!isAvailable}
                >
                  Ouvrir
                  <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              </CardContent>
            </Card>
          );

          return (
            <li key={service.id}>
              {isAvailable ? (
                <Link to={service.basePath} aria-label={`Ouvrir ${service.name}`}>
                  {content}
                </Link>
              ) : (
                <div aria-disabled="true">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
