import { ArrowRight, Briefcase, HeartPulse, Home, Lock, Receipt } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { SERVICES } from '@/app/config/services';
import { PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useVoicePage } from '@/features/voice/context/VoicePageContext';
import type { VoicePageAction } from '@/features/voice/types';
import type { AdministrationId } from '@/types';

/** One recognisable icon per administration, rather than a single generic mark repeated on every card. */
const ADMINISTRATION_ICONS: Record<AdministrationId, LucideIcon> = {
  caf: Home,
  'france-travail': Briefcase,
  'assurance-maladie': HeartPulse,
  impots: Receipt,
};

/**
 * "Administrations" — the first choice a citizen makes, right after voice
 * onboarding (see `VoiceOnboardingPage`), before any account is required.
 * CAF and France Travail are wired to real backends; the rest render as
 * locked tiles rather than pretending to be usable.
 */
export default function AdministrationsPage() {
  useDocumentTitle('Administrations');
  const navigate = useNavigate();

  const availableServices = SERVICES.filter((service) => service.status === 'available');
  const availableActions: VoicePageAction[] = availableServices.map((service) => ({
    id: `select_${service.id}`,
    label: service.name,
    description: `Choisir l’administration ${service.name}`,
    intent: { type: 'click_action', actionId: `select_${service.id}` },
  }));

  useVoicePage({
    readableText: `Page des administrations. Choisissez une administration pour accéder à ses services. Disponibles pour le moment : ${availableServices.map((s) => s.name).join(', ')}. Les autres arriveront bientôt.`,
    actions: availableActions,
    actionCallbacks: Object.fromEntries(
      availableServices.map((service) => [`select_${service.id}`, () => navigate(service.basePath)]),
    ),
  });

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Administrations"
        description="Choisissez l’administration avec laquelle vous souhaitez interagir."
      />

      <SectionHeader title="Administrations disponibles" as="h2" className="mb-4" />
      <ul className="grid gap-4 sm:grid-cols-2">
        {SERVICES.map((service) => {
          const isAvailable = service.status === 'available';
          const Icon = ADMINISTRATION_ICONS[service.id];
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
                  {service.logoUrl ? (
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1.5">
                      <img
                        src={service.logoUrl}
                        alt=""
                        aria-hidden="true"
                        className="size-full object-contain"
                      />
                    </span>
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                  )}
                  {!isAvailable && (
                    <Badge tone="neutral">
                      <Lock className="size-3" aria-hidden="true" />
                      Bientôt disponible
                    </Badge>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-headline-md text-primary">{service.name}</h3>
                  <p className="mt-1 text-body-sm text-on-surface-variant">
                    {service.description}
                  </p>
                </div>
                {/* Always reserved, just hidden when unavailable — see
                    `CitizenDashboardPage` for why every card keeps the same
                    height regardless of which row it falls in. */}
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
