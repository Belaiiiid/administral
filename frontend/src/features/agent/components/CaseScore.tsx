import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CaseScore as CaseScoreModel } from '@/types';
import { SCORE_BAND_LABEL, SCORE_BAND_TONE } from '@/features/agent/lib/casePresentation';

export interface CaseScoreProps {
  /** Absent when the scoring stage has not run for this case. */
  score?: CaseScoreModel;
  /** `inline` for table cells, `detail` for the case header. */
  variant?: 'inline' | 'detail';
  className?: string;
}

/**
 * Displays the AI eligibility score exactly as the backend supplied it.
 *
 * No threshold lives here. `band` arrives on the model because the cut-offs are
 * owned by the scoring service — if this component decided that 87 is "high",
 * the rule would exist in two systems and drift the first time it is retuned.
 */
export function CaseScore({ score, variant = 'inline', className }: CaseScoreProps) {
  if (!score) {
    return (
      <span className={cn('text-label-md text-outline', className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Score non calculé</span>
      </span>
    );
  }

  if (variant === 'inline') {
    return (
      <Badge tone={SCORE_BAND_TONE[score.band]} className={className}>
        {score.value}
        <span className="sr-only"> sur 100 — {SCORE_BAND_LABEL[score.band]}</span>
      </Badge>
    );
  }

  return (
    <div className={cn('flex items-baseline gap-3', className)}>
      <span className="text-display text-on-surface">
        {score.value}
        <span className="text-headline-md text-on-surface-variant">/100</span>
      </span>
      <Badge tone={SCORE_BAND_TONE[score.band]}>{SCORE_BAND_LABEL[score.band]}</Badge>
    </div>
  );
}
