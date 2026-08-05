import { useNavigate } from 'react-router-dom';

import { SERVICES } from '@/app/config/services';
import { ROUTES } from '@/app/router/paths';
import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { AdministrationCard } from '@/components/citizen/ServiceCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useVoicePage } from '@/features/voice/context/VoicePageContext';
import type { VoicePageAction } from '@/features/voice/types';

/**
 * "Administrations" — the first choice a citizen makes, and now the first
 * screen after sign-in: the voice choice is offered by a dialog on the landing
 * page, not by an interstitial standing between a citizen and their dossier.
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

      {/* `group/cards` powers the same "hovered card steps forward, its siblings
          recede" behaviour as the landing carousel — see `ServiceCard`. */}
      <ul className="group/cards grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {SERVICES.map((service) => (
          <li key={service.id}>
            <AdministrationCard service={service} size="compact" />
          </li>
        ))}
      </ul>
    </div>
  );
}
