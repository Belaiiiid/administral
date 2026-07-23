import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { SectionHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';
import { AgentPage, AsyncBoundary, CaseScore, CaseStatusBadge } from '@/features/agent/components';
import {
  CaseDocumentsCard,
  CaseFraudCard,
  CaseProfileCard,
  CoherenceReportCard,
  CompletenessReportCard,
} from '@/features/agent/cases/components';
import { useAgentCase } from '@/features/agent/hooks';
import { AGENT_ROUTES } from '@/features/agent/paths';

/**
 * A single case under instruction.
 *
 * Reads one `Case` through `useAgentCase` — future `GET /agent/cases/{id}` —
 * and displays it. The page is a pure projection of the object: the score, both
 * report verdicts and the status are all rendered as received. No document is
 * analysed, no right is evaluated and no score is recomputed here; all of that
 * happened in the pipeline before the case existed as a stored record.
 */
export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const resource = useAgentCase(caseId);

  return (
    <AgentPage
      title="Dossier"
      description={resource.data ? `Référence ${resource.data.applicationNumber}` : undefined}
      documentTitle="Dossier — Espace agent"
      actions={
        <Button variant="outline" asChild>
          <Link to={AGENT_ROUTES.cases}>
            <ArrowLeft aria-hidden="true" />
            Retour à la liste
          </Link>
        </Button>
      }
    >
      <AsyncBoundary
        resource={resource}
        // A single case is never "empty" — it either resolves or errors.
        isEmpty={() => false}
        fallback={
          <div className="space-y-gutter">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        }
      >
        {(caseRecord) => (
          <div className="space-y-gutter">
            <Card>
              <CardHeader>
                <SectionHeader title="Synthèse" as="h2" />
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-gutter">
                <div className="space-y-1">
                  <p className="text-headline-md text-on-surface">
                    {caseRecord.applicationNumber}
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    {caseRecord.service.label} · déposé le {formatDate(caseRecord.submittedAt)}
                  </p>
                  <CaseStatusBadge status={caseRecord.status} />
                </div>

                <div className="text-right">
                  <p className="mb-1 text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Score d’éligibilité
                  </p>
                  <CaseScore score={caseRecord.score} variant="detail" />
                  {caseRecord.score && (
                    <p className="mt-1 text-body-sm text-on-surface-variant">
                      Calculé le {formatDate(caseRecord.score.computedAt)} · modèle{' '}
                      {caseRecord.score.model}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <CaseProfileCard citizen={caseRecord.citizen} profile={caseRecord.profile} />

            <div className="grid gap-gutter lg:grid-cols-2">
              <CompletenessReportCard report={caseRecord.completenessReport} />
              <CoherenceReportCard report={caseRecord.coherenceReport} />
            </div>

            <CaseDocumentsCard documents={caseRecord.documents} />

            <CaseFraudCard documents={caseRecord.documents} />
          </div>
        )}
      </AsyncBoundary>
    </AgentPage>
  );
}
