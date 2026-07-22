import { AlertTriangle, CheckCircle2, Clock, FileText, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { ProcessStatus, StatusTone } from '@/types';

const STATUS_MAP: Record<
  ProcessStatus,
  { label: string; tone: StatusTone; Icon: typeof CheckCircle2 }
> = {
  draft: { label: 'Brouillon', tone: 'neutral', Icon: FileText },
  pending: { label: 'En attente', tone: 'warning', Icon: Clock },
  in_progress: { label: 'En cours', tone: 'info', Icon: RefreshCw },
  validated: { label: 'Validé', tone: 'success', Icon: CheckCircle2 },
  rejected: { label: 'Rejeté', tone: 'error', Icon: AlertTriangle },
};

export interface StatusBadgeProps {
  status: ProcessStatus;
  /** Override the default French label. */
  label?: string;
  showIcon?: boolean;
  className?: string;
}

/** Maps a business status to the visual vocabulary of the design system. */
export function StatusBadge({ status, label, showIcon = true, className }: StatusBadgeProps) {
  const { label: defaultLabel, tone, Icon } = STATUS_MAP[status];
  return (
    <Badge tone={tone} className={className}>
      {showIcon && <Icon aria-hidden="true" />}
      {label ?? defaultLabel}
    </Badge>
  );
}
