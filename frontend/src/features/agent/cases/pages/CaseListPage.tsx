import { Inbox, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionHeader } from '@/components/shared';
import { AgentPage, AsyncBoundary, CaseQueueTable } from '@/features/agent/components';
import { useAgentCases } from '@/features/agent/hooks';

/**
 * Full instruction queue.
 *
 * The search term is held in the URL rather than in component state, so a
 * filtered queue is shareable and survives a reload — and so the value flows
 * straight into the service as a query parameter. Filtering is applied by the
 * data source, never over an in-memory array here: the endpoint will be
 * paginated, and client-side filtering would only ever search the current page.
 */
export default function CaseListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';

  const cases = useAgentCases({ search: search || undefined });

  const handleSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('q', value);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  return (
    <AgentPage title="Dossiers" description="File d’instruction complète, tous statuts confondus.">
      <Card>
        <CardHeader>
          <SectionHeader
            title="Tous les dossiers"
            as="h2"
            action={
              <div className="w-64">
                <label htmlFor="case-search" className="sr-only">
                  Rechercher un dossier par référence ou allocataire
                </label>
                <Input
                  id="case-search"
                  type="search"
                  placeholder="Référence ou allocataire…"
                  startIcon={<Search />}
                  value={search}
                  onChange={(event) => handleSearch(event.target.value)}
                />
              </div>
            }
          />
        </CardHeader>

        <CardContent className="px-0">
          <AsyncBoundary
            resource={cases}
            fallback={
              <div className="space-y-2 px-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            }
            empty={{
              icon: Inbox,
              title: search ? 'Aucun résultat' : 'Aucun dossier',
              description: search
                ? `Aucun dossier ne correspond à « ${search} ».`
                : 'La file d’instruction est vide.',
            }}
          >
            {(rows) => (
              <CaseQueueTable
                caption="Tous les dossiers, tous statuts confondus"
                cases={rows}
                showWaitingDays
              />
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>
    </AgentPage>
  );
}
