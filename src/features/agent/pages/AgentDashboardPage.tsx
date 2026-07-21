import { Clock, FileSearch, Filter, Inbox, Search, TriangleAlert, Users } from 'lucide-react';

import { EmptyState, PageHeader, SectionHeader, StatusBadge } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { ProcessStatus } from '@/types';

interface AgentQueueRow {
  id: string;
  reference: string;
  citizen: string;
  submittedAt: string;
  waitingDays: number;
  status: ProcessStatus;
}

/** Empty until an agent-facing service exists. No citizen is fabricated here. */
const QUEUE: AgentQueueRow[] = [];

/** The counters the back-office exposes, without values until wired. */
const STATS = [
  { id: 'pending', label: 'Dossiers en attente', icon: Clock },
  { id: 'to-review', label: 'À vérifier aujourd’hui', icon: FileSearch },
  { id: 'citizens', label: 'Allocataires suivis', icon: Users },
] as const;

/**
 * Agent back-office placeholder.
 *
 * No mockup exists for this area (see docs/design-analysis.md §1.4), so this
 * page reuses existing primitives only — table, badges, stat cards — rather
 * than inventing a new visual language. Treat the layout as provisional and
 * validate it with the agent-facing designs when they arrive.
 */
export default function AgentDashboardPage() {
  useDocumentTitle('Espace agent');

  return (
    <div className="mx-auto max-w-container">
      <PageHeader title="Espace agent" description="Supervision et instruction des dossiers." />

      <Alert tone="warning" className="mb-8">
        <TriangleAlert aria-hidden="true" />
        <div>
          <AlertTitle>Écran provisoire</AlertTitle>
          <AlertDescription>
            Aucune maquette de référence n’existe pour l’espace agent. Cette page est un squelette
            construit à partir des composants existants et devra être revalidée.
          </AlertDescription>
        </div>
      </Alert>

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
                  <p className="text-display text-outline">
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">Donnée non disponible</span>
                  </p>
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
              <div className="flex gap-2">
                <div className="w-48">
                  <label htmlFor="agent-search" className="sr-only">
                    Rechercher un dossier
                  </label>
                  <Input
                    id="agent-search"
                    type="search"
                    placeholder="Rechercher…"
                    startIcon={<Search />}
                    disabled={QUEUE.length === 0}
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Filtrer la file"
                  disabled={QUEUE.length === 0}
                >
                  <Filter aria-hidden="true" />
                </Button>
              </div>
            }
          />
        </CardHeader>

        <CardContent className="px-0">
          {QUEUE.length > 0 ? (
            <Table>
              <caption className="sr-only">Dossiers en attente d’instruction</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Allocataire</TableHead>
                  <TableHead>Déposé le</TableHead>
                  <TableHead>Attente</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {QUEUE.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-label-md">{row.reference}</TableCell>
                    <TableCell>{row.citizen}</TableCell>
                    <TableCell className="text-on-surface-variant">{row.submittedAt}</TableCell>
                    <TableCell className="text-on-surface-variant">{row.waitingDays} jours</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm">
                        Instruire
                        <span className="sr-only"> le dossier {row.reference}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={Inbox}
              title="Aucun dossier à instruire"
              description="La file d’instruction sera alimentée par le service agent."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
