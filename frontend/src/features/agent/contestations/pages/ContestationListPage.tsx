import { Gavel } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AgentPage, AsyncBoundary } from '@/features/agent/components';
import { useContestations } from '@/features/agent/hooks';
import { AGENT_ROUTES } from '@/features/agent/paths';
import { CONTESTATION_STATUS_META, type ContestationStatus } from '@/types';

/** The status filters offered above the queue. `undefined` means "all". */
const FILTERS: { key: string; label: string; value: ContestationStatus | undefined }[] = [
  { key: 'all', label: 'Toutes', value: undefined },
  { key: 'PENDING', label: 'En attente', value: 'PENDING' },
  { key: 'UNDER_REVIEW', label: 'En examen', value: 'UNDER_REVIEW' },
  { key: 'ACCEPTED', label: 'Acceptées', value: 'ACCEPTED' },
  { key: 'REJECTED', label: 'Rejetées', value: 'REJECTED' },
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR');
}

/**
 * The contestation review queue — the agent side of the droit de contestation.
 *
 * The active status filter lives in the URL (`?status=`), so a filtered queue
 * is shareable and survives a reload, and the value flows straight into the
 * service as a query parameter. Filtering is the server's job, never an
 * in-memory filter over a fetched array.
 */
export default function ContestationListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status') ?? undefined;
  const active = FILTERS.find((f) => f.value === statusParam) ?? FILTERS[0];

  const contestations = useContestations(active.value);

  const setFilter = (value: ContestationStatus | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('status', value);
    else next.delete('status');
    setSearchParams(next, { replace: true });
  };

  return (
    <AgentPage
      title="Contestations"
      description="Les décisions contestées par les allocataires, à réexaminer."
    >
      <Card>
        <CardHeader>
          <SectionHeader
            title="File des contestations"
            as="h2"
            action={
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((filter) => (
                  <Button
                    key={filter.key}
                    variant={filter.key === active.key ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setFilter(filter.value)}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>
            }
          />
        </CardHeader>

        <CardContent className="px-0">
          <AsyncBoundary
            resource={contestations}
            fallback={
              <div className="space-y-2 px-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            }
            empty={{
              icon: Gavel,
              title: 'Aucune contestation',
              description:
                active.value === undefined
                  ? 'Aucune décision n’a été contestée pour le moment.'
                  : `Aucune contestation avec le statut « ${active.label} ».`,
            }}
          >
            {(rows) => (
              <Table>
                <caption className="sr-only">
                  Contestations à réexaminer, plus anciennes d’abord
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Allocataire</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Déposée le</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const meta = CONTESTATION_STATUS_META[row.status];
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Link
                            to={AGENT_ROUTES.contestationDetail(row.id)}
                            className="text-primary hover:underline"
                          >
                            {row.applicationNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-on-surface-variant">{row.citizenName}</TableCell>
                        <TableCell className="text-on-surface-variant">{row.reasonLabel}</TableCell>
                        <TableCell>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-on-surface-variant">
                          {formatDate(row.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>
    </AgentPage>
  );
}
