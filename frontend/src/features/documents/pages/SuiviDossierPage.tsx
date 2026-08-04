import {
  CheckCircle2,
  Circle,
  CircleDashed,
  FileClock,
  Info,
  Leaf,
  ScanSearch,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { citizenButton } from '@/components/citizen/citizenButton';
import { CitizenCard, CitizenCardBody, CitizenCardHeader } from '@/components/citizen/CitizenCard';
import { CitizenEmptyState } from '@/components/citizen/CitizenEmptyState';
import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { DecisionContestation } from '@/features/documents/components/DecisionContestation';
import { dossierService } from '@/services/dossierService';
import type { DossierAnomaly, DossierReview } from '@/services/documentService';

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
            ? 'border-success bg-success text-white'
            : step.state === 'current'
              ? 'border-brand bg-brand-soft text-brand'
              : 'border-border bg-surface text-muted-foreground',
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="font-display text-label-md text-ink">{step.label}</p>
        {step.description && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
        )}
      </div>
    </li>
  );
}

/**
 * Cohérence — the cross-document analysis run at submission (`analyser_coherence`
 * server-side, see `submission.py`). It is computed and returned by the review
 * endpoint on every submitted dossier, but the outcome was never actually shown
 * here: the citizen only ever saw the three tracking steps above, never why an
 * agent might be double-checking a piece of information.
 */
const COHERENCE_OUTCOME_META: Record<string, { label: string; className: string }> = {
  passed: { label: 'Cohérent', className: 'bg-success-surface text-success' },
  warning: { label: 'À vérifier', className: 'bg-warning-surface text-warning' },
  failed: { label: 'Incohérence détectée', className: 'bg-destructive/10 text-destructive' },
};

const ANOMALY_SEVERITY_META: Record<string, { label: string; className: string }> = {
  info: { label: 'Information', className: 'bg-brand-soft text-brand' },
  warning: { label: 'Vigilance', className: 'bg-warning-surface text-warning' },
  error: { label: 'Erreur', className: 'bg-destructive/10 text-destructive' },
};

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn('inline-flex rounded-full px-3 py-1 text-label-sm', className)}>
      {label}
    </span>
  );
}

function AnomalyRow({ anomaly }: { anomaly: DossierAnomaly }) {
  const meta = ANOMALY_SEVERITY_META[anomaly.severity] ?? ANOMALY_SEVERITY_META.warning;
  return (
    <li className="rounded-xl border border-border/60 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-label-md text-ink">{anomaly.field}</p>
        <Pill label={meta.label} className={meta.className} />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{anomaly.message}</p>
      {(anomaly.declared_value || anomaly.observed_value) && (
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-label-sm uppercase tracking-wide text-muted-foreground">
              Déclaré
            </dt>
            <dd className="text-ink">{anomaly.declared_value || '—'}</dd>
          </div>
          <div>
            <dt className="text-label-sm uppercase tracking-wide text-muted-foreground">
              Constaté
            </dt>
            <dd className="text-ink">{anomaly.observed_value || '—'}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}

function CoherenceCard({ coherence }: { coherence: NonNullable<DossierReview['coherence']> }) {
  const meta = COHERENCE_OUTCOME_META[coherence.outcome] ?? {
    label: coherence.outcome,
    className: 'bg-surface text-muted-foreground',
  };

  return (
    <CitizenCard>
      <CitizenCardHeader
        title="Analyse de cohérence"
        icon={ScanSearch}
        action={<Pill label={meta.label} className={meta.className} />}
      />
      <CitizenCardBody className="space-y-4">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <ScanSearch className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {coherence.explanation ??
            'Vos informations déclarées ont été comparées aux pièces déposées.'}
        </p>

        {coherence.anomalies.length > 0 ? (
          <ul className="space-y-3">
            {coherence.anomalies.map((anomaly, index) => (
              <AnomalyRow key={index} anomaly={anomaly} />
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-label-md text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            Aucune incohérence relevée entre vos informations et vos pièces.
          </p>
        )}

        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Cette analyse assiste l’instruction ; elle ne remplace pas la décision de l’agent CAF.
        </p>
      </CitizenCardBody>
    </CitizenCard>
  );
}

/**
 * Impact écologique — purely informational. No carbon-savings backend module
 * exists (yet) to back a figure, so this states the one concrete, verifiable
 * fact of an all-digital dossier rather than inventing a number nothing
 * actually computes — consistent with never presenting a guess as data.
 */
function EcologieCard() {
  return (
    <CitizenCard>
      <CitizenCardHeader title="Impact écologique" icon={Leaf} />
      <CitizenCardBody>
        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <Leaf className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          En transmettant votre dossier entièrement en ligne, vous évitez l’impression et
          l’envoi postal de vos justificatifs papier.
        </p>
      </CitizenCardBody>
    </CitizenCard>
  );
}

/** The "reveal" prompt shared by the cohérence and écologie sections. */
function RevealCard({
  icon: Icon,
  text,
  actionLabel,
  onReveal,
}: {
  icon: typeof Info;
  text: string;
  actionLabel: string;
  onReveal: () => void;
}) {
  return (
    <CitizenCard>
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {text}
        </p>
        <button
          type="button"
          onClick={onReveal}
          className={citizenButton({ variant: 'outline', size: 'sm' })}
        >
          {actionLabel}
        </button>
      </div>
    </CitizenCard>
  );
}

export default function SuiviDossierPage() {
  useDocumentTitle('Suivre un dossier déposé');
  const [review, setReview] = useState<DossierReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Neither ever appears automatically — each needs its own explicit click.
  const [showCoherence, setShowCoherence] = useState(false);
  const [showEcologie, setShowEcologie] = useState(false);

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
    <div className="mx-auto max-w-4xl">
      <CitizenPageHeader
        // Aligné sur « Déposer un dossier » (`PageHeader`), qui rend son <h1>
        // en `text-headline-lg-mobile md:text-display` avec la police sans.
        // `CitizenPageHeader` part sur `font-display` + `sm:text-3xl` (30px,
        // poids 600) : sans ces trois surcharges les deux titres du même
        // parcours n'ont ni la même police, ni la même taille, ni la même
        // graisse. `sm:text-display` remplace bien `sm:text-3xl` — tailwind-merge
        // arbitre par groupe *et* par variante.
        //
        // Valeur littérale plutôt que le jeton `text-action` : la classe
        // arbitraire est produite au scan des sources, donc elle apparaît sans
        // redémarrer Vite, contrairement à une couleur ajoutée à la config.
        titleClassName="font-sans text-[#102a74] sm:text-display"
        eyebrow="Où en êtes-vous"
        title="Suivre un dossier déposé"
        description="L’état d’avancement de votre dossier transmis à la CAF."
      />

      {isLoading && (
        <CitizenCard>
          <CitizenCardBody className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-64" />
                </div>
              </div>
            ))}
          </CitizenCardBody>
        </CitizenCard>
      )}

      {!isLoading && error && (
        <CitizenEmptyState
          icon={FileClock}
          tone="error"
          title="Chargement impossible"
          description={error}
          actions={
            <button type="button" onClick={load} className={citizenButton({ variant: 'outline' })}>
              Réessayer
            </button>
          }
        />
      )}

      {!isLoading && !error && review && !review.submitted && (
        <CitizenEmptyState
          icon={Circle}
          title="Aucun dossier envoyé pour le moment"
          description="Vous n’avez pas encore transmis de dossier à la CAF. Une fois envoyé, son suivi s’affichera ici."
          actions={
            // Mêmes classes que l'appel à l'action de la barre latérale, pour
            // que la seule sortie de cet écran vide se reconnaisse au premier
            // coup d'œil comme le chemin vers le dépôt.
            <Link to={ROUTES.dossier} className={citizenButton({ variant: 'marianne' })}>
              <Send aria-hidden="true" />
              Déposer un dossier
            </Link>
          }
        />
      )}

      {!isLoading && !error && review && review.submitted && (
        <div className="space-y-6">
          <CitizenCard>
            <CitizenCardHeader
              title={`Dossier ${review.application_number ?? ''}`}
              icon={FileClock}
              action={
                review.decision && (
                  <Pill
                    label={review.decision.outcome === 'validated' ? 'Validé' : 'Rejeté'}
                    className={
                      review.decision.outcome === 'validated'
                        ? 'bg-success-surface text-success'
                        : 'bg-surface text-muted-foreground'
                    }
                  />
                )
              }
            />
            <CitizenCardBody>
              <ol>
                {buildSteps(review).map((step, index, all) => (
                  <StepRow key={step.key} step={step} isLast={index === all.length - 1} />
                ))}
              </ol>
            </CitizenCardBody>
          </CitizenCard>

          {review.coherence &&
            (showCoherence ? (
              <CoherenceCard coherence={review.coherence} />
            ) : (
              <RevealCard
                icon={ScanSearch}
                text="Une analyse de cohérence entre vos informations et vos pièces a été réalisée."
                actionLabel="Voir les incohérences détectées"
                onReveal={() => setShowCoherence(true)}
              />
            ))}

          {showEcologie ? (
            <EcologieCard />
          ) : (
            <RevealCard
              icon={Info}
              text="Votre démarche entièrement numérique a aussi un impact écologique."
              actionLabel="Afficher l’impact écologique"
              onReveal={() => setShowEcologie(true)}
            />
          )}

          {review.decision && review.application_number && (
            <DecisionContestation applicationNumber={review.application_number} />
          )}
        </div>
      )}
    </div>
  );
}
