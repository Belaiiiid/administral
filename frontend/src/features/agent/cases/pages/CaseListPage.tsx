import { Inbox, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionHeader } from '@/components/shared';
import type { CaseSortField, CaseStatus, SortDirection } from '@/types';
import { AgentPage, AsyncBoundary } from '@/features/agent/components';
import { CaseInstructionTable } from '@/features/agent/cases/components/CaseInstructionTable';
import { CASE_STATUS_LABEL } from '@/features/agent/lib/casePresentation';
import { useAgentCasePage } from '@/features/agent/hooks';

const STATUS_OPTIONS: CaseStatus[] = [
  'submitted',
  'awaiting_documents',
  'under_review',
  'ready_for_decision',
  'validated',
  'rejected',
];

const PAGE_SIZE = 20;
const DEFAULT_SORT_BY: CaseSortField = 'submittedAt';
const DEFAULT_SORT_DIR: SortDirection = 'desc';

/**
 * Full instruction queue — the CAF instructor dashboard list.
 *
 * Every filter, the sort and the page number live in the URL, not component
 * state: a filtered, sorted, paginated view is shareable and survives a
 * reload, and the values flow straight into `GET /agent/cases/list` as query
 * parameters. Nothing here is filtered, sorted or paginated over an in-memory
 * array — the endpoint does all three server-side, so this page only ever
 * renders the one page of rows it asked for.
 */
export default function CaseListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const status = (searchParams.get('status') as CaseStatus | null) ?? undefined;
  const sortBy = (searchParams.get('sortBy') as CaseSortField | null) ?? DEFAULT_SORT_BY;
  const sortDir = (searchParams.get('sortDir') as SortDirection | null) ?? DEFAULT_SORT_DIR;
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const result = useAgentCasePage({
    search: search || undefined,
    status,
    sortBy,
    sortDir,
    page,
    pageSize: PAGE_SIZE,
  });

  const updateParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const handleSearch = (value: string) => updateParams({ q: value || undefined, page: undefined });

  const handleStatusChange = (value: string) =>
    updateParams({ status: value === 'all' ? undefined : value, page: undefined });

  const handleSortChange = (field: CaseSortField) => {
    if (field === sortBy) {
      updateParams({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' });
    } else {
      updateParams({ sortBy: field, sortDir: 'asc' });
    }
  };

  const totalPages = result.data ? Math.max(1, Math.ceil(result.data.total / PAGE_SIZE)) : 1;

  return (
    <AgentPage title="Dossiers" description="File d’instruction complète, tous statuts confondus.">
      <Card>
        <CardHeader>
          <SectionHeader
            title="Tous les dossiers"
            as="h2"
            action={
              <div className="flex items-center gap-3">
                <div className="w-48">
                  <label htmlFor="case-status-filter" className="sr-only">
                    Filtrer par statut
                  </label>
                  <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                    <SelectTrigger id="case-status-filter">
                      <SelectValue placeholder="Tous les statuts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {CASE_STATUS_LABEL[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
              </div>
            }
          />
        </CardHeader>

        <CardContent className="px-0">
          <AsyncBoundary
            resource={result}
            fallback={
              <div className="space-y-2 px-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            }
            empty={{
              icon: Inbox,
              title: search || status ? 'Aucun résultat' : 'Aucun dossier',
              description:
                search || status
                  ? 'Aucun dossier ne correspond aux filtres actuels.'
                  : 'La file d’instruction est vide.',
            }}
            isEmpty={(data) => data.items.length === 0}
          >
            {(data) => (
              <>
                <div className="overflow-x-auto">
                  <CaseInstructionTable
                    caption="Tous les dossiers, tous statuts confondus"
                    cases={data.items}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSortChange={handleSortChange}
                  />
                </div>

                <div className="flex items-center justify-between px-6 pt-4">
                  <p className="text-body-sm text-on-surface-variant">
                    {data.total} dossier{data.total > 1 ? 's' : ''} — page {page} sur {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => updateParams({ page: String(page - 1) })}
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => updateParams({ page: String(page + 1) })}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              </>
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>
    </AgentPage>
  );
}
