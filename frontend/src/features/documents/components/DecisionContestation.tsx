import { AlertTriangle, Gavel, Loader2, ScrollText, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { citizenButton } from '@/components/citizen/citizenButton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { contestationService } from '@/services/contestationService';
import {
  CONTESTATION_REASONS,
  CONTESTATION_STATUS_META,
  type Contestation,
  type ContestationReason,
} from '@/types';

/**
 * The citizen's right of contestation, on the decision they received.
 *
 * Renders one of three states for the given dossier: the challenge already
 * filed (its status + the agent's resolution once it lands), the form to file
 * one, or the button that opens that form. It never decides anything — it lets
 * a citizen dispute a decision and follow the human review of that dispute.
 *
 * Only shown once a decision exists (the parent gates on `review.decision`),
 * because there is nothing to contest before one.
 */

/** Administral equivalents of the `Badge` tones `CONTESTATION_STATUS_META` names. */
const STATUS_PILL: Record<string, string> = {
  neutral: 'bg-surface text-muted-foreground',
  info: 'bg-brand-soft text-brand',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning',
  error: 'bg-destructive/10 text-destructive',
  accent: 'bg-brand-soft text-brand',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR');
}

interface DecisionContestationProps {
  /** The submitted dossier's reference, e.g. `APL-TEST-DOSSIER-0001`. */
  applicationNumber: string;
}

export function DecisionContestation({ applicationNumber }: DecisionContestationProps) {
  const [existing, setExisting] = useState<Contestation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState<ContestationReason | ''>('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useMemo(
    () => () =>
      contestationService
        .listMine()
        .then((all) => {
          // The most recent challenge on *this* dossier — the list is newest first.
          setExisting(all.find((c) => c.applicationNumber === applicationNumber) ?? null);
        })
        .catch(() => undefined)
        .finally(() => setLoaded(true)),
    [applicationNumber],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason || description.trim().length < 10 || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await contestationService.create({
        applicationNumber,
        reason,
        description: description.trim(),
      });
      setExisting(created);
      setFormOpen(false);
      setReason('');
      setDescription('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La contestation n’a pas pu être envoyée.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!loaded) return null;

  // 1. A challenge already exists for this dossier — show its state and outcome.
  if (existing) {
    const meta = CONTESTATION_STATUS_META[existing.status];
    const resolved = existing.status === 'ACCEPTED' || existing.status === 'REJECTED';
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-display text-label-md text-ink">
            <ScrollText className="size-4 shrink-0" aria-hidden="true" />
            Contestation déposée
          </span>
          <span
            className={cn(
              'inline-flex rounded-full px-3 py-1 text-label-sm',
              STATUS_PILL[meta.tone] ?? 'bg-surface text-muted-foreground',
            )}
          >
            {meta.label}
          </span>
        </div>
        <p className="text-muted-foreground">
          <span className="font-semibold text-ink">Motif :</span> {existing.reasonLabel}
        </p>
        <p className="mt-1 leading-relaxed text-muted-foreground">{existing.description}</p>
        <p className="mt-3 text-label-sm uppercase tracking-wide text-muted-foreground">
          Déposée le {formatDate(existing.createdAt)}
        </p>
        {resolved && existing.resolutionComment && (
          <div
            className={cn(
              'mt-4 rounded-xl border-l-4 p-4',
              existing.status === 'ACCEPTED'
                ? 'border-l-success bg-success-surface'
                : 'border-l-destructive bg-destructive/5',
            )}
          >
            <p className="font-display text-label-md text-ink">
              Réponse de l’agent{existing.reviewedBy ? ` — ${existing.reviewedBy}` : ''}
            </p>
            <p className="mt-1 leading-relaxed text-muted-foreground">{existing.resolutionComment}</p>
          </div>
        )}
      </div>
    );
  }

  // 2. The form to file a challenge.
  if (formOpen) {
    return (
      <form onSubmit={submit} className="rounded-2xl border border-border/60 bg-card p-6 shadow-soft">
        <p className="mb-4 flex items-center gap-2 font-display text-label-md text-ink">
          <Gavel className="size-4 shrink-0" aria-hidden="true" />
          Contester la décision
        </p>

        <label htmlFor="contestation-reason" className="mb-1 block text-sm text-muted-foreground">
          Motif de la contestation
        </label>
        <Select value={reason} onValueChange={(value) => setReason(value as ContestationReason)}>
          <SelectTrigger id="contestation-reason" className="mb-3">
            <SelectValue placeholder="Choisissez un motif…" />
          </SelectTrigger>
          <SelectContent>
            {CONTESTATION_REASONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label htmlFor="contestation-description" className="mb-1 block text-sm text-muted-foreground">
          Expliquez pourquoi vous contestez cette décision
        </label>
        <Textarea
          id="contestation-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Décrivez précisément ce que vous contestez et pourquoi (au moins 10 caractères)…"
          rows={4}
        />

        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={!reason || description.trim().length < 10 || isSubmitting}
            className={citizenButton()}
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Send aria-hidden="true" />
            )}
            Envoyer la contestation
          </button>
          <button
            type="button"
            onClick={() => setFormOpen(false)}
            disabled={isSubmitting}
            className={citizenButton({ variant: 'outline' })}
          >
            Annuler
          </button>
        </div>
      </form>
    );
  }

  // 3. The entry point.
  return (
    <button
      type="button"
      onClick={() => setFormOpen(true)}
      className={citizenButton({ variant: 'outline', className: 'w-full' })}
    >
      <AlertTriangle aria-hidden="true" />
      Contester cette décision
    </button>
  );
}
