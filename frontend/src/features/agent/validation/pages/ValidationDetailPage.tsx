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
  CoherenceReportCard,
  CompletenessReportCard,
} from '@/features/agent/cases/components';
import { DecisionOutcomeCard, DecisionPanel } from '@/features/agent/validation/components';
import { useAgentCase, useCaseDecision } from '@/features/agent/hooks';
import { citizenFullName } from '@/features/agent/lib/casePresentation';
import { AGENT_ROUTES } from '@/features/agent/paths';

/** The decision screen: accept or reject, with the case evidence in view. */
export default function ValidationDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const resource = useAgentCase(caseId);
  const controller = useCaseDecision(caseId);

  return (
    <AgentPage
      title="Décision"
      description={resource.data ? `Dossier ${resource.data.applicationNumber}` : undefined}
      documentTitle="Décision — Espace agent"
      actions={
        <Button variant="outline" asChild>
          <Link to={AGENT_ROUTES.validation}>
            <ArrowLeft aria-hidden="true" />
            Retour à la file
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
          </div>
        }
      >
        {(caseRecord) => {
          /*
           * A decision taken just now, or one already recorded on the case from
           * an earlier visit — the screen must not look undecided just because
           * this mount has no local state yet.
           */
          const decision = controller.decision ?? caseRecord.decision;

          return (
          <div className="space-y-gutter">
            <Card>
              <CardHeader>
                <SectionHeader title="Dossier soumis à décision" as="h2" />
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-gutter">
                <div className="space-y-1">
                  <p className="text-headline-md text-on-surface">
                    {caseRecord.applicationNumber}
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    {citizenFullName(caseRecord.citizen)} · {caseRecord.service.label} · déposé le{' '}
                    {formatDate(caseRecord.submittedAt)}
                  </p>
                  <CaseStatusBadge status={caseRecord.status} />
                </div>
                <div className="text-right">
                  <p className="mb-1 text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Score d’éligibilité
                  </p>
                  <CaseScore score={caseRecord.score} variant="detail" />
                </div>
              </CardContent>
            </Card>

            {/*
             * The two reports sit above the decision panel on purpose: they are
             * the evidence the decision must rest on, and an agent should read
             * them before the buttons are in reach.
             */}
            <div className="grid gap-gutter lg:grid-cols-2">
              <CompletenessReportCard report={caseRecord.completenessReport} />
              <CoherenceReportCard report={caseRecord.coherenceReport} />
            </div>

            {/* The pieces are openable here above all: this is the screen where
                the decision is signed, and an agent should be able to read the
                evidence before the buttons are in reach. */}
            <CaseDocumentsCard documents={caseRecord.documents} caseId={caseRecord.id} />

            <CaseFraudCard documents={caseRecord.documents} />

            {decision ? (
              <DecisionOutcomeCard decision={decision} />
            ) : (
              <DecisionPanel controller={controller} />
            )}
          </div>
          );
        }}
      </AsyncBoundary>
    </AgentPage>
  );
}
