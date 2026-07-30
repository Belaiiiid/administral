import { ClipboardCheck, Info, ListChecks, ShieldQuestion } from 'lucide-react';

import { SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CategoryAssessment, MonParcoursResult } from '@/features/agent/services';
import { useCaseAssessment } from '@/features/agent/hooks';

/**
 * The Ad'Ministral Result — the unified, deterministic assessment.
 *
 * A pure projection of `GET /api/agent/cases/{id}/assessment`: it renders the
 * global score, the four categories (each with its score, explanation and
 * evidence) and the recommended review actions. It computes nothing — the score
 * is arithmetic done server-side — and it is decision *support*: the disclaimer
 * states plainly that it does not decide eligibility.
 */

const BAND_META: Record<string, { label: string; tone: 'success' | 'warning' | 'error' }> = {
  favorable: { label: 'Favorable', tone: 'success' },
  vigilance: { label: 'Vigilance', tone: 'warning' },
  defavorable: { label: 'Défavorable', tone: 'error' },
};

const CATEGORY_LABEL = {
  completeness: 'Complétude',
  coherence: 'Cohérence',
  documentQuality: 'Qualité documentaire',
  vigilance: 'Vigilance',
} as const;

/** Score → tone. Higher is better for every category (vigilance included). */
function scoreTone(score: number): 'success' | 'warning' | 'error' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'error';
}

const TONE_TEXT = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
} as const;

function CategoryTile({ label, weight, category }: { label: string; weight: number; category: CategoryAssessment }) {
  const tone = scoreTone(category.score);
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-label-md text-on-surface">
          {label}
          <span className="ml-1.5 text-label-sm text-on-surface-variant">
            {Math.round(weight * 100)} %
          </span>
        </p>
        <p className={cn('text-headline-md font-semibold', TONE_TEXT[tone])}>{category.score}</p>
      </div>
      <Progress
        value={category.score}
        aria-label={`${label} : ${category.score} sur 100`}
        className="mb-2"
      />
      <p className="text-body-sm text-on-surface-variant">{category.explanation}</p>
      {category.evidence.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {category.evidence.map((item, index) => (
            <li key={index} className="flex gap-1.5 text-body-sm text-on-surface-variant">
              <span aria-hidden="true">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssessmentView({ result }: { result: MonParcoursResult }) {
  const band = BAND_META[result.band] ?? { label: result.band, tone: 'warning' as const };
  const globalTone = scoreTone(result.score);

  return (
    <div className="space-y-gutter">
      {/* Global score */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface-container p-4">
        <div>
          <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
            Score global
          </p>
          <p className={cn('text-headline-lg font-semibold', TONE_TEXT[globalTone])}>
            {result.score}
            <span className="text-body-md text-on-surface-variant">/100</span>
          </p>
        </div>
        <Badge tone={band.tone}>{band.label}</Badge>
      </div>

      {/* Four categories */}
      <div className="grid gap-3 sm:grid-cols-2">
        <CategoryTile
          label={CATEGORY_LABEL.completeness}
          weight={result.completeness.weight}
          category={result.completeness}
        />
        <CategoryTile
          label={CATEGORY_LABEL.coherence}
          weight={result.coherence.weight}
          category={result.coherence}
        />
        <CategoryTile
          label={CATEGORY_LABEL.documentQuality}
          weight={result.documentQuality.weight}
          category={result.documentQuality}
        />
        <CategoryTile
          label={CATEGORY_LABEL.vigilance}
          weight={result.vigilance.weight}
          category={result.vigilance}
        />
      </div>

      {/* Recommended human review actions */}
      <div className="rounded-lg border-l-4 border-l-primary bg-primary-fixed/40 p-4">
        <p className="mb-2 flex items-center gap-2 text-label-md text-on-surface">
          <ListChecks className="size-4 shrink-0 text-primary" aria-hidden="true" />
          Actions de revue recommandées
        </p>
        <ul className="space-y-1">
          {result.recommendedActions.map((action, index) => (
            <li key={index} className="flex gap-2 text-body-sm text-on-surface-variant">
              <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Decision-support disclaimer — the agent decides, not the score. */}
      <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {result.disclaimer}
      </p>
    </div>
  );
}

export interface CaseAssessmentCardProps {
  /** The case id — its `entity_id` for the assessment endpoint. */
  caseId: string;
}

export function CaseAssessmentCard({ caseId }: CaseAssessmentCardProps) {
  const resource = useCaseAssessment(caseId);

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Ad'Ministral Result"
          as="h2"
          action={
            <span className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
              <ShieldQuestion className="size-4" aria-hidden="true" />
              Aide à l’instruction
            </span>
          }
        />
      </CardHeader>
      <CardContent>
        {resource.isLoading && <Skeleton className="h-64 w-full" />}
        {resource.error && (
          <p className="text-body-sm text-on-surface-variant">
            L’évaluation Ad'Ministral n’a pas pu être chargée.
          </p>
        )}
        {resource.data && <AssessmentView result={resource.data} />}
      </CardContent>
    </Card>
  );
}
