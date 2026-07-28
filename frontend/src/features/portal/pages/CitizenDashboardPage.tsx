import { ArrowRight, Bell, Landmark } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { SERVICES } from '@/app/config/services';
import { ROUTES } from '@/app/router/paths';
import { PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSessionStore } from '@/store/sessionStore';
import { dossierService } from '@/services/dossierService';

/**
 * "Mes services" — the citizen's landing page once their profile is filled.
 *
 * Doubles as the landing gate: a citizen whose profile is not yet complete
 * (housing + professional status unanswered) is sent straight to the
 * profiling assistant instead of seeing a hub with nothing behind it yet.
 * `profileComplete` is computed server-side (`PersonalizedDossierSchema`),
 * the same flag the dossier page already trusts — one definition, not two.
 *
 * Only `caf` (APL) is wired to a real backend; the rest render as disabled
 * tiles rather than pretending to be functional — consistent with dropping
 * the old fake "active services" dashboard widgets this replaces.
 */
export default function CitizenDashboardPage() {
  useDocumentTitle('Mes services');
  const { displayName } = useSessionStore();
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  useEffect(() => {
    dossierService
      .getDossier()
      .then((dossier) => setProfileComplete(dossier.profileComplete))
      .catch(() => setProfileComplete(true)); // fail open: never trap a citizen on an error
  }, []);

  if (profileComplete === null) {
    return (
      <div className="mx-auto max-w-container space-y-gutter">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!profileComplete) {
    return <Navigate to={ROUTES.onboardingProfilage} replace />;
  }

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Mes services"
        description={
          displayName
            ? `Bienvenue ${displayName}, choisissez le service que vous souhaitez utiliser.`
            : 'Choisissez le service que vous souhaitez utiliser.'
        }
        actions={
          <Button asChild variant="outline">
            <Link to={ROUTES.portalNotifications}>
              <Bell aria-hidden="true" />
              Notifications
            </Link>
          </Button>
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
                {isAvailable && (
                  <span className="flex items-center gap-1 text-label-md text-primary">
                    Ouvrir
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                )}
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
