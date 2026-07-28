import { Clock, FileSearch, Inbox, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { SectionHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CaseQueueStats } from '@/types';
import { AgentPage, AsyncBoundary, CaseQueueTable } from '@/features/agent/components';
import { useAgentCases, useAgentQueueStats } from '@/features/agent/hooks';
import { AGENT_ROUTES } from '@/features/agent/paths';

/** Tile definitions: labels and icons only — every value comes from the API. */
const STATS: { id: keyof CaseQueueStats; label: string; icon: LucideIcon }[] = [
  { id: 'pending', label: 'Dossiers en attente', icon: Clock },
  { id: 'toReviewToday', label: 'À vérifier aujourd’hui', icon: FileSearch },
  { id: 'citizensTracked', label: 'Allocataires suivis', icon: Users },
];

/**
 * Back-office landing screen: workload counters plus the head of the
 * instruction queue. The full queue, with filtering and pagination, lives in
 * the `cases` sub-domain.
 *
 * Data flow: this page → hooks → agentCaseService → data source. It performs no
 * fetching, no filtering and no arithmetic; the counters are aggregated by the
 * service and the rows arrive pre-sorted and pre-projected.
 */
export default function AgentDashboardPage() {
  const stats = useAgentQueueStats();
  const queue = useAgentCases();

  return (
    <AgentPage title="Espace agent" description="Supervision et instruction des dossiers.">
      <ul className="mb-gutter grid gap-gutter sm:grid-cols-3">
        {STATS.map((stat) => (
          <li key={stat.id}>
            <Card className="h-full">
              <CardContent className="flex items-center gap-4 p-6">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                  <stat.icon className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                    {stat.label}
                  </p>
                  <AsyncBoundary resource={stats} fallback={<Skeleton className="mt-1 h-9 w-12" />}>
                    {(data) => <p className="text-display text-on-surface">{data[stat.id]}</p>}
                  </AsyncBoundary>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader>
          <SectionHeader
            title="File d’instruction"
            as="h2"
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to={AGENT_ROUTES.cases}>Voir tous les dossiers</Link>
              </Button>
            }
          />
        </CardHeader>

        <CardContent className="px-0">
          <AsyncBoundary
            resource={queue}
            fallback={
              <div className="space-y-2 px-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            }
            empty={{
              icon: Inbox,
              title: 'Aucun dossier à instruire',
              description: 'La file d’instruction est vide.',
            }}
          >
            {(cases) => (
              <CaseQueueTable caption="Dossiers en attente d’instruction" cases={cases} />
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>
    </AgentPage>
  );
}
