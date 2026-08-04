import { BarChart3 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAsyncResource } from '@/features/agent/hooks';
import { MonthlyTrend } from '@/features/agent/reports/components/MonthlyTrend';
import { StatBar, type StatBarDatum } from '@/features/agent/reports/components/StatBar';
import {
  agentStatisticsService,
  STATISTICS_SERVICES,
  type AgentStatistics,
} from '@/features/agent/services';

/**
 * The six case statuses, in lifecycle order with the label an agent uses.
 *
 * Ordered by where a case sits in the workflow, not by volume: the table is
 * read as a pipeline, and sorting it by count would reshuffle the stages every
 * time the numbers move.
 */
const STATUS_ROWS: ReadonlyArray<{
  key: keyof AgentStatistics['byStatus'];
  label: string;
  hint: string;
}> = [
  { key: 'submitted', label: 'Reçus', hint: 'Déposés, pas encore ouverts' },
  { key: 'awaitingDocuments', label: 'En attente de pièces', hint: 'Dossier incomplet' },
  { key: 'underReview', label: 'En cours d’instruction', hint: 'Analyse en cours' },
  {
    key: 'readyForDecision',
    label: 'Intervention agent requise',
    hint: 'Prêts pour décision',
  },
  { key: 'validated', label: 'Validés', hint: 'Décision favorable' },
  { key: 'rejected', label: 'Refusés', hint: 'Décision défavorable' },
];

/** A nullable average: `null` means "nothing to average yet", never zero. */
function formatAverage(value: number | null, unit: string): string {
  return value === null ? '—' : `${value.toLocaleString('fr-FR')} ${unit}`;
}

/**
 * A single headline figure.
 *
 * A stat tile, not a chart: one number has no shape to plot, and rendering it
 * as a one-bar chart would add ink without adding information.
 */
function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-border bg-surface-lowest p-5">
      <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className="mt-2 text-display tabular-nums text-on-surface">{value}</p>
      {hint && <p className="mt-1 text-label-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}

/**
 * Service-level statistics: volumes, delays, decision breakdown.
 *
 * Every figure arrives pre-aggregated from `GET /agent/stats/overview`. The
 * page never counts rows itself — the queue endpoint is filtered and will be
 * paginated, so a client-side tally would describe the current page rather
 * than the service.
 */
export default function ReportsPage() {
  const stats = useAsyncResource<AgentStatistics>(
    () => agentStatisticsService.getOverview(),
    [],
  );

  return (
    <AgentPage
      title="Statistiques"
      description="Volumes traités, délais d’instruction et répartition des décisions."
    >
      <AsyncBoundary
        resource={stats}
        fallback={
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-64" />
            <Skeleton className="h-80" />
          </div>
        }
        // Zero cases *and* zero citizens is a service with nothing in it. Zero
        // cases alone is not empty — "12 citoyens, 0 dossier" is a finding.
        isEmpty={(data) => data.casesTotal === 0 && data.citizensTotal === 0}
        empty={{
          icon: BarChart3,
          title: 'Aucune donnée statistique',
          description: 'Aucun citoyen ni dossier n’est encore enregistré.',
        }}
      >
        {(data) => {
          // An administration with no case is absent from the aggregate; the
          // page still lists it, at zero. A missing row would read as an
          // oversight rather than as a fact about the service.
          const counts = new Map(data.byService.map((s) => [s.serviceId, s.count]));
          const serviceRows: StatBarDatum[] = STATISTICS_SERVICES.map((service) => ({
            label: service.label,
            value: counts.get(service.id) ?? 0,
            muted: service.planned,
            note: service.planned ? '(à venir)' : undefined,
          }));

          return (
            <div className="space-y-8">
              {/* ---------------------------------------------------------- */}
              {/* Citoyens                                                    */}
              {/* ---------------------------------------------------------- */}
              <section aria-labelledby="stats-citizens">
                <h2
                  id="stats-citizens"
                  className="mb-4 text-label-md uppercase tracking-wider text-on-surface"
                >
                  Citoyens
                </h2>

                <div className="grid gap-4 sm:grid-cols-3">
                  <StatTile
                    label="Citoyens enregistrés"
                    value={data.citizensTotal.toLocaleString('fr-FR')}
                  />
                  <StatTile
                    label="Citoyens avec dossier"
                    value={data.citizensWithCases.toLocaleString('fr-FR')}
                    hint={
                      data.citizensTotal > 0
                        ? `${Math.round(
                            (data.citizensWithCases / data.citizensTotal) * 100,
                          )} % de la base`
                        : undefined
                    }
                  />
                  <StatTile
                    label="Dossiers par citoyen actif"
                    value={
                      data.citizensWithCases > 0
                        ? (data.casesTotal / data.citizensWithCases).toFixed(1).replace('.', ',')
                        : '—'
                    }
                  />
                </div>

                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>Répartition par service</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <StatBar
                      data={serviceRows}
                      caption="Nombre de dossiers par administration"
                    />
                  </CardContent>
                </Card>
              </section>

              {/* ---------------------------------------------------------- */}
              {/* Évolution                                                   */}
              {/* ---------------------------------------------------------- */}
              <section aria-labelledby="stats-trend">
                <h2
                  id="stats-trend"
                  className="mb-4 text-label-md uppercase tracking-wider text-on-surface"
                >
                  Évolution des demandes
                </h2>
                <Card>
                  <CardContent className="pt-6">
                    {data.monthlySubmissions.length > 0 ? (
                      <MonthlyTrend data={data.monthlySubmissions} />
                    ) : (
                      <p className="text-body-sm text-on-surface-variant">
                        Aucun dépôt enregistré sur la période.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </section>

              {/* ---------------------------------------------------------- */}
              {/* Dossiers                                                    */}
              {/* ---------------------------------------------------------- */}
              <section aria-labelledby="stats-cases">
                <h2
                  id="stats-cases"
                  className="mb-4 text-label-md uppercase tracking-wider text-on-surface"
                >
                  Dossiers
                </h2>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatTile
                    label="Dossiers au total"
                    value={data.casesTotal.toLocaleString('fr-FR')}
                  />
                  <StatTile
                    label="Délai moyen de traitement"
                    value={formatAverage(data.averageProcessingDays, 'j')}
                    hint="Du dépôt à la décision"
                  />
                  <StatTile
                    label="Taux de complétude"
                    value={formatAverage(data.averageCompletionRate, '%')}
                    hint="Pièces fournies sur pièces requises"
                  />
                  <StatTile
                    label="Score IA moyen"
                    value={formatAverage(data.averageScore, '/ 100')}
                    hint="Aide à la décision"
                  />
                </div>

                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>Répartition par statut</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Dossiers</TableHead>
                          <TableHead className="text-right">Part</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {STATUS_ROWS.map((row) => {
                          const count = data.byStatus[row.key];
                          return (
                            <TableRow key={row.key}>
                              <TableCell>
                                <span className="block text-on-surface">{row.label}</span>
                                <span className="block text-label-sm text-on-surface-variant">
                                  {row.hint}
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{count}</TableCell>
                              <TableCell className="text-right tabular-nums text-on-surface-variant">
                                {data.casesTotal > 0
                                  ? `${Math.round((count / data.casesTotal) * 100)} %`
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </section>
            </div>
          );
        }}
      </AsyncBoundary>
    </AgentPage>
  );
}
