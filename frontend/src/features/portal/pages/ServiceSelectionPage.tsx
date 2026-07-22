import { ArrowLeft, Briefcase, Building2, Check, HomeIcon, Plus, Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { SERVICES } from '@/app/config/services';
import { ROUTES } from '@/app/router/paths';
import { AiSuggestionCard } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import type { AdministrationId } from '@/types';

const SERVICE_ICONS: Record<AdministrationId, typeof HomeIcon> = {
  caf: HomeIcon,
  'france-travail': Briefcase,
  'assurance-maladie': Stethoscope,
  impots: Building2,
};

/**
 * Service picker — the architectural heart of the platform.
 * Selection is local UI state only; persistence belongs to `portalService`.
 */
export default function ServiceSelectionPage() {
  useDocumentTitle('Choix des services');
  const [selected, setSelected] = useState<Set<AdministrationId>>(new Set());

  const toggle = (id: AdministrationId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-headline-lg-mobile text-primary md:text-display">
          Quels services souhaitez-vous utiliser ?
        </h1>
        <p className="text-body-lg text-on-surface-variant">
          Choisissez les administrations qui vous concernent pour personnaliser votre
          accompagnement.
        </p>
      </div>

      <fieldset className="mb-12">
        <legend className="sr-only">Sélection des administrations</legend>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {SERVICES.map((service) => {
            const Icon = SERVICE_ICONS[service.id];
            const isSelected = selected.has(service.id);
            const isDisabled = service.status === 'coming_soon';

            return (
              <div
                key={service.id}
                className={cn(
                  'flex flex-col justify-between rounded-xl border bg-surface-lowest p-6 transition-all duration-200 ease-standard',
                  isSelected ? 'border-primary bg-primary-fixed/30' : 'border-border',
                  isDisabled && 'opacity-60',
                )}
              >
                <div>
                  <div className="mb-4 flex items-start justify-between">
                    <span
                      className={cn(
                        'flex size-12 items-center justify-center rounded-lg',
                        isSelected
                          ? 'bg-primary-fixed text-primary'
                          : 'bg-surface-container text-on-surface-variant',
                      )}
                    >
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full border-2 transition-colors',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-outline-variant bg-surface-lowest',
                      )}
                    >
                      {isSelected && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  </div>

                  <h2 className="mb-2 flex items-center gap-2 text-headline-md text-primary">
                    {service.name}
                    {isDisabled && <Badge tone="neutral">Bientôt</Badge>}
                  </h2>
                  <p className="mb-6 text-body-sm text-on-surface-variant">{service.description}</p>
                </div>

                <Button
                  variant={isSelected ? 'primary' : 'outline-primary'}
                  block
                  disabled={isDisabled}
                  onClick={() => toggle(service.id)}
                  aria-pressed={isSelected}
                >
                  {isSelected ? 'Désactiver' : 'Activer'}
                </Button>
              </div>
            );
          })}

          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-low py-10 opacity-70 md:col-span-2">
            <span className="mb-4 flex size-12 items-center justify-center rounded-full border-2 border-outline-variant text-outline">
              <Plus className="size-6" aria-hidden="true" />
            </span>
            <h2 className="text-headline-md text-on-surface-variant">Autres services publics</h2>
            <p className="mt-1 text-label-sm uppercase tracking-widest text-outline">Prochainement</p>
          </div>
        </div>
      </fieldset>

      <AiSuggestionCard title="Assistant" className="mb-12" showFeedback={false}>
        Plus vous rattachez d’administrations, plus vos démarches peuvent être pré-remplies
        automatiquement. Vos choix restent modifiables à tout moment.
      </AiSuggestionCard>

      <div className="flex flex-col items-center justify-between gap-6 border-t border-border pt-8 md:flex-row">
        <Button asChild variant="ghost">
          <Link to={ROUTES.portal}>
            <ArrowLeft aria-hidden="true" />
            Retour
          </Link>
        </Button>

        <div className="flex items-center gap-6">
          <p className="hidden text-body-sm text-on-surface-variant md:block">
            Vous pourrez modifier vos choix plus tard.
          </p>
          <Button asChild size="lg" disabled={selected.size === 0}>
            <Link to={ROUTES.onboardingAccessibility}>Continuer</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
