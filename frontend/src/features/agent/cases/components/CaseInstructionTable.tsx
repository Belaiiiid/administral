import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import type { CaseSortField, CaseSummary, SortDirection } from '@/types';
import { AGENT_ROUTES } from '@/features/agent/paths';
import {
  REPORT_OUTCOME_LABEL,
  REPORT_OUTCOME_TONE,
  citizenFullName,
  fraudRiskTone,
} from '@/features/agent/lib/casePresentation';
import { CaseScore } from '@/features/agent/components/CaseScore';
import { CaseStatusBadge } from '@/features/agent/components/CaseStatusBadge';

export interface CaseInstructionTableProps {
  cases: CaseSummary[];
  caption: string;
  sortBy: CaseSortField;
  sortDir: SortDirection;
  onSortChange: (field: CaseSortField) => void;
}

interface SortableColumn {
  field: CaseSortField;
  label: string;
}

const SORTABLE_COLUMNS: SortableColumn[] = [
  { field: 'applicationNumber', label: 'Référence' },
  { field: 'submittedAt', label: 'Déposé le' },
  { field: 'scoreValue', label: 'Score' },
  { field: 'completionRate', label: 'Complétude' },
];

/**
 * The CAF instructor list — score, complétude, cohérence and statut
 * anti-fraude, every one of them read from the row exactly as the backend
 * computed it. Never a place that recalculates a value: absence renders as
 * « — », the same convention `CaseScore` already uses for a score that has
 * not been computed yet.
 *
 * Deliberately not a variant of `CaseQueueTable`: that component's own
 * contract is "no sorting, no filtering, prints what the endpoint already
 * ordered" — this table's whole purpose is clickable, stateful column
 * sorting, which would contradict it. Presentation atoms (`CaseScore`,
 * `CaseStatusBadge`, `citizenFullName`) are still shared.
 */
export function CaseInstructionTable({
  cases,
  caption,
  sortBy,
  sortDir,
  onSortChange,
}: CaseInstructionTableProps) {
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          {SORTABLE_COLUMNS.map((column) => (
            <TableHead key={column.field}>
              <SortButton
                field={column.field}
                label={column.label}
                activeField={sortBy}
                direction={sortDir}
                onSortChange={onSortChange}
              />
            </TableHead>
          ))}
          <TableHead>Allocataire</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Cohérence</TableHead>
          <TableHead>Anti-fraude</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="text-label-md">{item.applicationNumber}</TableCell>
            <TableCell className="text-on-surface-variant">
              {formatDate(item.submittedAt)}
            </TableCell>
            <TableCell>
              <CaseScore score={item.score} />
            </TableCell>
            <TableCell>
              {item.completionRate == null ? (
                <span className="text-on-surface-variant">—</span>
              ) : (
                `${item.completionRate} %`
              )}
            </TableCell>
            <TableCell>{citizenFullName(item.citizen)}</TableCell>
            <TableCell>
              <CaseStatusBadge status={item.status} />
            </TableCell>
            <TableCell>
              {item.coherenceStatus == null ? (
                <span className="text-on-surface-variant">—</span>
              ) : (
                <Badge tone={REPORT_OUTCOME_TONE[item.coherenceStatus]}>
                  {REPORT_OUTCOME_LABEL[item.coherenceStatus]}
                </Badge>
              )}
            </TableCell>
            <TableCell>
              {item.fraudStatus == null ? (
                <span className="text-on-surface-variant">—</span>
              ) : (
                <Badge tone={fraudRiskTone(item.fraudStatus)}>{item.fraudStatus}</Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="outline" size="sm" asChild>
                <Link to={AGENT_ROUTES.caseDetail(item.id)}>
                  Voir
                  <span className="sr-only"> le dossier {item.applicationNumber}</span>
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface SortButtonProps {
  field: CaseSortField;
  label: string;
  activeField: CaseSortField;
  direction: SortDirection;
  onSortChange: (field: CaseSortField) => void;
}

function SortButton({ field, label, activeField, direction, onSortChange }: SortButtonProps) {
  const isActive = field === activeField;
  const Icon = isActive ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onSortChange(field)}
      className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface"
      aria-pressed={isActive}
    >
      {label}
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">
        {isActive ? (direction === 'asc' ? ', tri croissant' : ', tri décroissant') : ', trier'}
      </span>
    </button>
  );
}
