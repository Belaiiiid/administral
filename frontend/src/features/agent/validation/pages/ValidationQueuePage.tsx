import { ShieldCheck } from 'lucide-react';

import { SectionHeader } from '@/components/shared';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentPage, AsyncBoundary, CaseQueueTable } from '@/features/agent/components';
import { useAgentCases } from '@/features/agent/hooks';
import { AGENT_ROUTES } from '@/features/agent/paths';

/**
 * Cases whose instruction is complete and that await a formal decision.
 * Separate from `cases` because the action is a decision, not an edit.
 *
 * Lists every case still awaiting a decision, not only those the pipeline
 * marked `ready_for_decision`. A case with missing pieces or unresolved
 * anomalies is exactly the one an agent needs to reach in order to reject it —
 * restricting the queue to clean cases left the rejection path unreachable.
 * The status column tells the agent what they are walking into.
 *
 * The filter is applied by the service, not here: `pendingDecision` is sent as
 * a query parameter so the future endpoint returns only the relevant page, and
 * so the rule defining "pending" is stated once, server-side. Filtering a
 * loaded array client-side would break the moment the queue is paginated.
 */
export default function ValidationQueuePage() {
  const queue = useAgentCases({ pendingDecision: true });

  return (
    <AgentPage title="Validation" description="Dossiers en attente de décision.">
      <Card>
        <CardHeader>
          <SectionHeader title="En attente de décision" as="h2" />
        </CardHeader>
        <CardContent className="px-0">
          <AsyncBoundary
            resource={queue}
            fallback={
              <div className="space-y-2 px-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            }
            empty={{
              icon: ShieldCheck,
              title: 'Aucun dossier en attente de décision',
              description: 'Tous les dossiers instruits ont été traités.',
            }}
          >
            {(cases) => (
              <CaseQueueTable
                caption="Dossiers en attente de décision"
                cases={cases}
                showWaitingDays
                detailPath={AGENT_ROUTES.validationDetail}
                actionLabel="Décider"
              />
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>
    </AgentPage>
  );
}
