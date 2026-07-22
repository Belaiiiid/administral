import { BarChart3 } from 'lucide-react';

import { EmptyState } from '@/components/shared';
import { Card, CardContent } from '@/components/ui/card';
import { AgentPage } from '@/features/agent/components';

/**
 * Service-level statistics: volumes, delays, decision breakdown.
 *
 * No charting library is present in package.json and adding one is a
 * platform-wide decision — see docs/agent-portal-implementation-plan.md §9.
 * Until then this renders tabular figures only.
 */
export default function ReportsPage() {
  return (
    <AgentPage
      title="Statistiques"
      description="Volumes traités, délais d’instruction et répartition des décisions."
    >
      <Card>
        <CardContent className="px-0">
          <EmptyState
            icon={BarChart3}
            title="Aucune donnée statistique"
            description="Les indicateurs seront fournis par agentReportService."
          />
        </CardContent>
      </Card>
    </AgentPage>
  );
}
