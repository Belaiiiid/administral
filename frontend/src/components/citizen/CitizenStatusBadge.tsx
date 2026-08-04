import { AlertTriangle, CheckCircle2, Clock, FileText, RefreshCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ProcessStatus } from '@/types';

const STATUS_MAP: Record<
  ProcessStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  draft: { label: 'Brouillon', className: 'bg-surface text-muted-foreground', Icon: FileText },
  pending: { label: 'En attente', className: 'bg-amber-50 text-amber-700', Icon: Clock },
  in_progress: { label: 'En cours', className: 'bg-brand-soft text-brand', Icon: RefreshCw },
  validated: { label: 'Validé', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  rejected: { label: 'Rejeté', className: 'bg-destructive/10 text-destructive', Icon: AlertTriangle },
};

export interface CitizenStatusBadgeProps {
  status: ProcessStatus;
  /** Override the default French label. */
  label?: string;
  className?: string;
}

/**
 * Administral status pill — citizen area only. Structural twin of
 * `components/shared/StatusBadge`, restyled with the Administral tokens.
 * Kept separate so the agent back-office, which reuses the original, is never
 * affected by this redesign.
 */
export function CitizenStatusBadge({ status, label, className }: CitizenStatusBadgeProps) {
  const { label: defaultLabel, className: toneClass, Icon } = STATUS_MAP[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
        toneClass,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label ?? defaultLabel}
    </span>
  );
}
