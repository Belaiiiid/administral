import { StatusBadge } from '@/components/shared';
import type { CaseStatus } from '@/types';
import { CASE_STATUS_BADGE, CASE_STATUS_LABEL } from '@/features/agent/lib/casePresentation';

export interface CaseStatusBadgeProps {
  status: CaseStatus;
  className?: string;
}

/**
 * Renders a `CaseStatus` through the citizen design system's <StatusBadge />.
 *
 * A thin adapter rather than a new badge: the agent vocabulary is finer-grained
 * than `ProcessStatus`, but the *visual* language must stay identical across
 * both portals. The lookup lives in `lib/casePresentation`, so this component
 * holds no mapping of its own.
 */
export function CaseStatusBadge({ status, className }: CaseStatusBadgeProps) {
  return (
    <StatusBadge
      status={CASE_STATUS_BADGE[status]}
      label={CASE_STATUS_LABEL[status]}
      className={className}
    />
  );
}
