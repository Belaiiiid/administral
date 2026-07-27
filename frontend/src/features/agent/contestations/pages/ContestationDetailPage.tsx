import { ArrowLeft, CheckCircle2, ExternalLink, ScrollText, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatDate } from '@/lib/utils';
import { AgentPage, AsyncBoundary } from '@/features/agent/components';
import { CaseAuditCard } from '@/features/agent/cases/components';
import { useContestation, useContestationActions } from '@/features/agent/hooks';
import { AGENT_ROUTES } from '@/features/agent/paths';
import { CONTESTATION_STATUS_META, type Contestation } from '@/types';

/**
 * One contestation under review — the agent's working surface for the droit de
 * contestation.
 *
 * Shows the decision being contested, the citizen's explanation, a one-click
 * link into the full dossier (its documents and pipeline reports are the
 * evidence), and the dossier's immutable audit timeline. From here the agent
 * takes the challenge into review and resolves it — accepted or rejected, with
 * a mandatory motive. The AI does not resolve; the agent does.
 */
export default function ContestationDetailPage() {
  const { contestationId } = useParams<{ contestationId: string }>();
  const [reloadToken, setReloadToken] = useState(0);
  const resource = useContestation(contestationId, reloadToken);

  const [comment, setComment] = useState('');
  const actions = useContestationActions(contestationId, () => {
    setComment('');
    setReloadToken((token) => token + 1);
  });

  return (
    <AgentPage
      title="Contestation"
      documentTitle="Contestation — Espace agent"
      actions={
        <Button variant="outline" asChild>
          <Link to={AGENT_ROUTES.contestations}>
            <ArrowLeft aria-hidden="true" />
            Retour aux contestations
          </Link>
        </Button>
      }
    >
      <AsyncBoundary
        resource={resource}
        isEmpty={() => false}
        fallback={
          <div className="space-y-gutter">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        }
      >
        {(contestation) => (
          <ContestationView
            contestation={contestation}
            comment={comment}
            onCommentChange={setComment}
            isSubmitting={actions.isSubmitting}
            actionError={actions.error}
            onReview={actions.review}
            onResolve={actions.resolve}
          />
        )}
      </AsyncBoundary>
    </AgentPage>
  );
}

interface ContestationViewProps {
  contestation: Contestation;
  comment: string;
  onCommentChange: (value: string) => void;
  isSubmitting: boolean;
  actionError: Error | null;
  onReview: () => void;
  onResolve: (input: { accept: boolean; resolutionComment: string }) => void;
}

function ContestationView({
  contestation,
  comment,
  onCommentChange,
  isSubmitting,
  actionError,
  onReview,
  onResolve,
}: ContestationViewProps) {
  const meta = CONTESTATION_STATUS_META[contestation.status];
  const isResolved =
    contestation.status === 'ACCEPTED' || contestation.status === 'REJECTED';
  const canReview = contestation.status === 'PENDING';
  const canResolve = contestation.status === 'PENDING' || contestation.status === 'UNDER_REVIEW';

  return (
    <div className="space-y-gutter">
      {/* Synthèse */}
      <Card>
        <CardHeader>
          <SectionHeader
            title="Synthèse"
            as="h2"
            action={<Badge tone={meta.tone}>{meta.label}</Badge>}
          />
        </CardHeader>
        <CardContent className="flex flex-wrap items-start justify-between gap-gutter">
          <div className="space-y-1">
            <p className="text-headline-md text-on-surface">{contestation.applicationNumber}</p>
            <p className="text-body-sm text-on-surface-variant">
              Déposée par {contestation.citizenName} le {formatDate(contestation.createdAt)}
            </p>
            <p className="text-body-sm text-on-surface-variant">
              Motif : <span className="text-on-surface">{contestation.reasonLabel}</span>
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to={AGENT_ROUTES.caseDetail(contestation.dossierId)}>
              <ExternalLink aria-hidden="true" />
              Voir le dossier complet
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Décision contestée */}
      {contestation.decision && (
        <Card>
          <CardHeader>
            <SectionHeader title="Décision contestée" as="h2" />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'rounded-lg border-l-4 p-4 text-body-sm',
                contestation.decision.outcome === 'validated'
                  ? 'border-l-success bg-success-surface'
                  : 'border-l-destructive bg-destructive-surface',
              )}
            >
              <p className="text-label-md text-on-surface">
                {contestation.decision.outcome === 'validated'
                  ? 'Dossier validé'
                  : 'Dossier rejeté'}{' '}
                — {contestation.decision.decidedBy}, le{' '}
                {formatDate(contestation.decision.decidedAt)}
              </p>
              <p className="mt-1 text-on-surface-variant">{contestation.decision.explanation}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Explication du citoyen */}
      <Card>
        <CardHeader>
          <SectionHeader title="Explication de l’allocataire" as="h2" />
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-body-md text-on-surface">
            {contestation.description}
          </p>
        </CardContent>
      </Card>

      {/* Réexamen — actions or the recorded resolution */}
      <Card>
        <CardHeader>
          <SectionHeader title="Réexamen" as="h2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {isResolved ? (
            <div
              className={cn(
                'rounded-lg border-l-4 p-4 text-body-sm',
                contestation.status === 'ACCEPTED'
                  ? 'border-l-success bg-success-surface'
                  : 'border-l-destructive bg-destructive-surface',
              )}
            >
              <p className="flex items-center gap-2 text-label-md text-on-surface">
                {contestation.status === 'ACCEPTED' ? (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                ) : (
                  <XCircle className="size-4" aria-hidden="true" />
                )}
                Contestation {meta.label.toLowerCase()}
                {contestation.reviewedBy ? ` par ${contestation.reviewedBy}` : ''}
              </p>
              {contestation.resolutionComment && (
                <p className="mt-1 text-on-surface-variant">{contestation.resolutionComment}</p>
              )}
            </div>
          ) : (
            <>
              {contestation.status === 'UNDER_REVIEW' && (
                <p className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                  <ScrollText className="size-4 shrink-0" aria-hidden="true" />
                  En cours d’examen{contestation.reviewedBy ? ` par ${contestation.reviewedBy}` : ''}.
                </p>
              )}

              {canReview && (
                <Button variant="outline-primary" onClick={onReview} disabled={isSubmitting}>
                  <ScrollText aria-hidden="true" />
                  Prendre en examen
                </Button>
              )}

              {canResolve && (
                <div className="space-y-3">
                  <label
                    htmlFor="resolution-comment"
                    className="block text-body-sm text-on-surface-variant"
                  >
                    Motif de la décision (obligatoire)
                  </label>
                  <Textarea
                    id="resolution-comment"
                    value={comment}
                    onChange={(event) => onCommentChange(event.target.value)}
                    placeholder="Expliquez la suite donnée à la contestation…"
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => onResolve({ accept: true, resolutionComment: comment })}
                      disabled={isSubmitting || comment.trim().length === 0}
                    >
                      <CheckCircle2 aria-hidden="true" />
                      Accepter la contestation
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => onResolve({ accept: false, resolutionComment: comment })}
                      disabled={isSubmitting || comment.trim().length === 0}
                    >
                      <XCircle aria-hidden="true" />
                      Rejeter la contestation
                    </Button>
                  </div>
                </div>
              )}

              {actionError && (
                <p role="alert" className="text-body-sm text-destructive">
                  {actionError.message}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* The dossier's immutable audit trail — contestation events included. */}
      <CaseAuditCard applicationNumber={contestation.applicationNumber} />
    </div>
  );
}
