import { CheckCircle2, Circle, CircleDashed, FileClock, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { EmptyState, PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { DecisionContestation } from '@/features/documents/components/DecisionContestation';
import { dossierService } from '@/services/dossierService';
import type { DossierReview } from '@/services/documentService';

/**
 * "Suivre un dossier déposé" — the read-only counterpart to "Envoyer un
 * dossier". Once a dossier is sent, this is where the citizen comes back to
 * see where it stands, not the deposit page — the two are different intents
 * (act vs check), so they get different pages rather than one page trying to
 * be both.
 */

type StepState = 'done' | 'current' | 'upcoming';

interface Step {
  key: string;
  label: string;
  description: string;
  state: StepState;
}

const STEP_ICON: Record<StepState, typeof CheckCircle2> = {
  done: CheckCircle2,
  current: FileClock,
  upcoming: CircleDashed,
};

function buildSteps(review: DossierReview): Step[] {
  const hasDecision = review.decision !== null;
  const validated = review.decision?.outcome === 'validated';

  return [
    {
      key: 'recu',
      label: 'Dossier reçu',
      description: review.submitted_at
        ? `Transmis le ${new Date(review.submitted_at).toLocaleDateString('fr-FR')}`
        : 'Votre dossier est arrivé à la CAF.',
      state: 'done',
    },
    {
      key: 'instruction',
      label: 'Instruction par un agent',
      description: hasDecision
        ? 'Un agent a examiné votre dossier.'
        : 'Un agent CAF vérifie vos pièces et votre situation.',
      state: hasDecision ? 'done' : 'current',
    },
    {
      key: 'resultat',
      label: hasDecision ? (validated ? 'Dossier validé' : 'Dossier rejeté') : 'Résultat',
      description: hasDecision
        ? (review.decision?.explanation ?? '')
        : 'La décision s’affichera ici dès qu’elle sera rendue.',
      state: hasDecision ? 'done' : 'upcoming',
    },
  ];
}

function StepRow({ step, isLast }: { step: Step; isLast: boolean }) {
  const Icon = STEP_ICON[step.state];
  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      {!isLast && (
        <span
          className={cn(
            'absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5',
            step.state === 'done' ? 'bg-success' : 'bg-border',
          )}
          aria-hidden="true"
        />
      )}
      <span
        className={cn(
          'z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2',
          step.state === 'done'
            ? 'border-success bg-success text-success-foreground'
            : step.state === 'current'
              ? 'border-primary bg-primary-fixed text-primary'
              : 'border-border bg-surface-lowest text-on-surface-variant',
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-label-md text-on-surface">{step.label}</p>
        {step.description && (
          <p className="mt-0.5 text-body-sm text-on-surface-variant">{step.description}</p>
        )}
      </div>
    </li>
  );
}

export default function SuiviDossierPage() {
  useDocumentTitle('Suivre un dossier déposé');
  const [review, setReview] = useState<DossierReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    return dossierService
      .getDossier()
      .then((dossier) => dossierService.getReview(dossier.applicationId))
      .then(setReview)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Chargement impossible.'),
      )
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Suivre un dossier déposé"
        description="L’état d’avancement de votre dossier transmis à la CAF."
      />

      {isLoading && (
        <div className="space-y-gutter">
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!isLoading && error && (
        <EmptyState
          icon={FileClock}
          title="Chargement impossible"
          description={error}
          actions={
            <Button variant="outline" onClick={load}>
              Réessayer
            </Button>
          }
        />
      )}

      {!isLoading && !error && review && !review.submitted && (
        <EmptyState
          icon={Circle}
          title="Aucun dossier envoyé pour le moment"
          description="Vous n’avez pas encore transmis de dossier à la CAF. Une fois envoyé, son suivi s’affichera ici."
          actions={
            <Button asChild>
              <Link to={ROUTES.dossier}>
                <Send aria-hidden="true" />
                Envoyer un dossier
              </Link>
            </Button>
          }
        />
      )}

      {!isLoading && !error && review && review.submitted && (
        <div className="space-y-gutter">
          <Card>
            <CardHeader>
              <SectionHeader
                title={`Dossier ${review.application_number ?? ''}`}
                as="h2"
                action={
                  review.decision && (
                    <Badge tone={review.decision.outcome === 'validated' ? 'success' : 'neutral'}>
                      {review.decision.outcome === 'validated' ? 'Validé' : 'Rejeté'}
                    </Badge>
                  )
                }
              />
            </CardHeader>
            <CardContent>
              <ol>
                {buildSteps(review).map((step, index, all) => (
                  <StepRow key={step.key} step={step} isLast={index === all.length - 1} />
                ))}
              </ol>
            </CardContent>
          </Card>

          {review.decision && review.application_number && (
            <DecisionContestation applicationNumber={review.application_number} />
          )}
        </div>
      )}
    </div>
  );
}
