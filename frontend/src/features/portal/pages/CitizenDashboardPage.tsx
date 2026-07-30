import { ArrowRight, Bot, Clock, FileCheck2, Landmark, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { SERVICES } from '@/app/config/services';
import { PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSessionStore } from '@/store/sessionStore';

interface DashboardStat {
  icon: LucideIcon;
  value: string;
  label: string;
}

/**
 * Indicative figures, presented the same way as the public landing page's
 * stats band (`LandingStats`) — no citizen-facing analytics endpoint exists
 * yet, so these are illustrative placeholders, not live-computed counts.
 */
const DASHBOARD_STATS: DashboardStat[] = [
  { icon: Users, value: '12 400+', label: 'Citoyens accompagnés' },
  { icon: FileCheck2, value: '8 900+', label: 'Dossiers traités' },
  { icon: Clock, value: '< 2 min', label: 'Temps moyen de réponse' },
  { icon: Bot, value: '24h/24, 7j/7', label: 'Disponibilité de l’assistant IA' },
];

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

      <ul className="mb-gutter grid gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        {DASHBOARD_STATS.map((stat) => (
          <li key={stat.label}>
            <Card className="h-full">
              <CardContent className="flex items-center gap-4 p-6">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                  <stat.icon className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                    {stat.label}
                  </p>
                  <p className="text-headline-md text-on-surface">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

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
