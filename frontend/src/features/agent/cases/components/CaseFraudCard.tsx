import { ShieldAlert, ShieldCheck } from 'lucide-react';

import { SectionHeader } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { CaseDocument } from '@/types';
import { fraudRiskTone } from '@/features/agent/lib/casePresentation';

export interface CaseFraudCardProps {
  documents: CaseDocument[];
}

/**
 * Document authenticity — Agent C4 metadata forensics.
 *
 * Read-only, like every other agent panel: the analysis ran upstream, before
 * the case reached this portal. This card surfaces its output for the reviewing
 * agent — the deterministic signals and the LLM verdict — and never recomputes
 * anything.
 *
 * Only documents the pipeline actually analysed appear; a case with no forensic
 * data renders the reassuring empty state rather than a blank panel.
 */
export function CaseFraudCard({ documents }: CaseFraudCardProps) {
  const analysed = documents.filter((doc) => doc.fraudAnalysis);
  const flagged = analysed.filter((doc) => doc.fraudAnalysis?.aDesSignaux);

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Authenticité des pièces"
          as="h2"
          action={
            analysed.length > 0 ? (
              <Badge tone={flagged.length > 0 ? 'warning' : 'success'}>
                {flagged.length > 0
                  ? `${flagged.length} pièce${flagged.length > 1 ? 's' : ''} à vérifier`
                  : 'Aucun signal'}
              </Badge>
            ) : undefined
          }
        />
      </CardHeader>
      <CardContent className="space-y-gutter">
        {analysed.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">
            Aucune analyse de falsification n’est disponible pour ce dossier.
          </p>
        ) : (
          analysed.map((document) => {
            const fraud = document.fraudAnalysis!;
            const clean = !fraud.aDesSignaux;

            return (
              <div key={document.id} className="rounded-lg border border-border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {clean ? (
                      <ShieldCheck className="size-4 text-success" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="size-4 text-warning" aria-hidden="true" />
                    )}
                    <span className="text-label-md text-on-surface">
                      {document.requirementLabel}
                    </span>
                    <span className="truncate text-body-sm text-on-surface-variant">
                      {fraud.fichier}
                    </span>
                  </span>
                  <Badge tone={fraudRiskTone(fraud.niveauRisque)}>{fraud.niveauRisque}</Badge>
                </div>

                {clean ? (
                  <p className="text-body-sm text-on-surface-variant">
                    Métadonnées cohérentes — aucun signal de falsification.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Metadata the signals rest on. */}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-body-sm">
                      {fraud.logiciel && (
                        <>
                          <dt className="text-on-surface-variant">Logiciel</dt>
                          <dd className="text-on-surface">{fraud.logiciel}</dd>
                        </>
                      )}
                      {fraud.dateCreation && (
                        <>
                          <dt className="text-on-surface-variant">Création</dt>
                          <dd className="text-on-surface">{fraud.dateCreation}</dd>
                        </>
                      )}
                      {fraud.dateModification && (
                        <>
                          <dt className="text-on-surface-variant">Modification</dt>
                          <dd className="text-on-surface">{fraud.dateModification}</dd>
                        </>
                      )}
                    </dl>

                    {fraud.signauxAVerifier.length > 0 && (
                      <ul className="space-y-1">
                        {fraud.signauxAVerifier.map((signal, index) => (
                          <li key={index} className="flex gap-2 text-body-sm text-on-surface">
                            <span aria-hidden="true" className="text-warning">
                              •
                            </span>
                            {signal}
                          </li>
                        ))}
                      </ul>
                    )}

                    {fraud.analyseLlm && (
                      <Alert tone="ai">
                        <AlertTitle>
                          Analyse forensique — {fraud.analyseLlm.niveauRisque}
                        </AlertTitle>
                        <AlertDescription className="space-y-2">
                          <p>{fraud.analyseLlm.verdict}</p>
                          {fraud.analyseLlm.signauxLlm.length > 0 && (
                            <ul className="ml-4 list-disc space-y-1">
                              {fraud.analyseLlm.signauxLlm.map((signal, index) => (
                                <li key={index}>{signal}</li>
                              ))}
                            </ul>
                          )}
                          {fraud.analyseLlm.recommandation && (
                            <p className="font-medium">
                              Recommandation : {fraud.analyseLlm.recommandation}
                            </p>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
