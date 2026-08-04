import { ArrowRight, Briefcase, HeartPulse, Home, Lock, Receipt } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { SERVICES } from '@/app/config/services';
import { ROUTES } from '@/app/router/paths';
import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useVoicePage } from '@/features/voice/context/VoicePageContext';
import type { VoicePageAction } from '@/features/voice/types';
import { cn } from '@/lib/utils';
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
    <div className="mx-auto max-w-7xl">
      <CitizenPageHeader
        backTo={ROUTES.home}
        eyebrow="Bienvenue sur Administral"
        title="Choisissez une administration"
        description="Sélectionnez l’administration avec laquelle vous souhaitez interagir. D’autres seront progressivement disponibles."
      />

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((service) => {
          const isAvailable = service.status === 'available';
          const Icon = ADMINISTRATION_ICONS[service.id];

          const content = (
            <article
              className={cn(
                'flex h-full flex-col justify-between rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-300',
                isAvailable && 'hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg',
                !isAvailable && 'opacity-60',
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  {service.logoUrl ? (
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-white p-1.5">
                      <img src={service.logoUrl} alt="" aria-hidden="true" className="size-full object-contain" />
                    </span>
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                  )}
                  {!isAvailable && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-semibold text-brand">
                      <Lock className="size-3" aria-hidden="true" />
                      Bientôt
                    </span>
                  )}
                </div>
                <p className="mt-4 font-display text-lg font-extrabold text-ink">{service.name}</p>
                {service.fullName && (
                  <p className="mt-1 text-xs font-semibold leading-snug text-brand">
                    {service.fullName}
                  </p>
                )}
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{service.description}</p>
              </div>
              <span
                className={cn(
                  'mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand',
                  !isAvailable && 'invisible',
                )}
                aria-hidden={!isAvailable}
              >
                Ouvrir
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </article>
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
