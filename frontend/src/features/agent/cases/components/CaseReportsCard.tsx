import { Check, Minus } from 'lucide-react';

import { SectionHeader } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import type { CoherenceReport, CompletenessReport } from '@/types';
import {
  ANOMALY_TONE,
  REPORT_OUTCOME_LABEL,
  REPORT_OUTCOME_TONE,
} from '@/features/agent/lib/casePresentation';

/**
 * The two pipeline verdicts, rendered verbatim.
 *
 * Both reports are produced upstream of the Agent Portal. `completionRate`,
 * `outcome` and every anomaly arrive computed — this file re-derives none of
 * them, it only lays them out.
 */

export interface CompletenessReportCardProps {
  report?: CompletenessReport;
}

export function CompletenessReportCard({ report }: CompletenessReportCardProps) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Contrôle de complétude"
          as="h2"
          action={
            report && (
              <Badge tone={REPORT_OUTCOME_TONE[report.outcome]}>
                {REPORT_OUTCOME_LABEL[report.outcome]}
              </Badge>
            )
          }
        />
      </CardHeader>
      <CardContent>
        {!report ? (
          <p className="text-body-sm text-on-surface-variant">
            Le contrôle de complétude n’a pas encore été effectué pour ce dossier.
          </p>
        ) : (
          <>
            <div className="mb-4">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-body-sm text-on-surface-variant">Pièces reçues</span>
                <span className="text-label-md text-on-surface">{report.completionRate} %</span>
              </div>
              <Progress value={report.completionRate} />
            </div>

            <ul className="space-y-1">
              {report.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2 py-1">
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full',
                      item.received
                        ? 'bg-success-surface text-success'
                        : 'bg-surface-highest text-outline',
                    )}
                  >
                    {item.received ? (
                      <Check className="size-3" aria-hidden="true" />
                    ) : (
                      <Minus className="size-3" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-body-sm',
                      item.received ? 'text-on-surface' : 'text-on-surface-variant',
                    )}
                  >
                    {item.label}
                    <span className="sr-only">{item.received ? ' — reçue' : ' — manquante'}</span>
                  </span>
                  {item.required && !item.received && (
                    <Badge tone="warning" className="ml-auto">
                      Obligatoire
                    </Badge>
                  )}
                </li>
              ))}
            </ul>

            <p className="mt-4 text-body-sm text-on-surface-variant">
              Contrôlé le {formatDate(report.checkedAt)}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export interface CoherenceReportCardProps {
  report?: CoherenceReport;
}

export function CoherenceReportCard({ report }: CoherenceReportCardProps) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Contrôle de cohérence"
          as="h2"
          action={
            report && (
              <Badge tone={REPORT_OUTCOME_TONE[report.outcome]}>
                {REPORT_OUTCOME_LABEL[report.outcome]}
              </Badge>
            )
          }
        />
      </CardHeader>
      <CardContent>
        {!report ? (
          <p className="text-body-sm text-on-surface-variant">
            Le contrôle de cohérence n’a pas encore été effectué pour ce dossier.
          </p>
        ) : (
          <>
            {typeof report.coherenceScore === 'number' && (
              <div className="mb-4">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-body-sm text-on-surface-variant">
                    Score de cohérence global
                  </span>
                  <span className="text-label-md text-on-surface">{report.coherenceScore} / 100</span>
                </div>
                <Progress value={report.coherenceScore} />
              </div>
            )}

            {report.aiExplanation && (
              <p className="mb-4 rounded-lg bg-surface-low p-3 text-body-sm text-on-surface-variant">
                {report.aiExplanation}
              </p>
            )}

            {report.anomalies.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">
                Aucune incohérence détectée entre les données déclarées et les pièces fournies.
              </p>
            ) : (
              <ul className="space-y-3">
                {report.anomalies.map((anomaly) => (
                  <li key={anomaly.id}>
                    <Alert tone={ANOMALY_TONE[anomaly.severity]}>
                      <div>
                        <AlertTitle>{anomaly.field}</AlertTitle>
                        <AlertDescription>
                          {anomaly.message}
                          <span className="mt-1 block text-body-sm text-on-surface-variant">
                            Déclaré : {anomaly.declaredValue} · Constaté : {anomaly.observedValue}
                          </span>
                        </AlertDescription>
                      </div>
                    </Alert>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
