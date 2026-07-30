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

const detectorLabel: Record<string, string> = {
  metadata: 'Informations du fichier',
  integrity: 'Vérifications du document',
  ela: 'Analyse de compression',
  trufor: 'Analyse visuelle',
  copy_move: 'Recherche de zones copiées',
  noise: 'Analyse du bruit de l’image',
  dct: 'Analyse de compression',
  ocr_layout: 'Structure du texte',
};

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

                {fraud.scoreFinal !== undefined && fraud.scoreFinal !== null && (
                  <p className="mb-3 text-body-sm text-on-surface-variant">
                    Risque de fraude : <strong className="text-on-surface">{Math.round(fraud.scoreFinal * 100)} %</strong>
                    {' '}— confiance de la décision : <strong className="text-on-surface">{Math.round((fraud.confiance ?? 0) * 100)} %</strong>
                  </p>
                )}

                {clean ? (
                  <div className="space-y-3">
                    <p className="text-body-sm text-on-surface-variant">
                      {(fraud.confiance ?? 0) < 0.5
                        ? 'Analyse insuffisamment couverte : aucune anomalie n’a été confirmée, mais certains contrôles n’ont pas pu être exploités.'
                        : 'Aucune anomalie n’a été confirmée par les contrôles disponibles.'}
                    </p>
                    <details className="group rounded-lg border border-border p-3">
                      <summary className="cursor-pointer text-label-md font-medium text-on-surface-variant hover:text-on-surface">
                        Comprendre cette analyse
                      </summary>
                      <div className="space-y-2 pt-3 text-body-sm text-on-surface">
                        {fraud.contributions?.map((contribution) => (
                          <p key={contribution.detector}><strong>{detectorLabel[contribution.detector] ?? contribution.detector}</strong> : {contribution.explanation}</p>
                        ))}
                        {fraud.analyseLlm ? <p>{fraud.analyseLlm.analyseLlm}</p> : (
                          <p className="text-on-surface-variant">L’explication détaillée par IA sera disponible lorsque Mistral est configuré.</p>
                        )}
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Visual Evidence (Always shown if suspicious) */}
                    <div className="space-y-3">
                      {fraud.visualisationsFusionnees?.filter((page) => page.isSuspicious).map((page) => (
                        <div key={`fusion-${page.pageNumber}`} className="space-y-2">
                          <p className="text-label-md text-on-surface">Zones suspectes fusionnées — page {page.pageNumber}</p>
                          <img src={page.markedImageBase64} alt={`Page ${page.pageNumber}, zones suspectes fusionnées`} className="max-h-[36rem] w-full rounded-md border border-border object-contain" />
                        </div>
                      ))}

                      {false && fraud.visionModel?.pages.filter((page) => page.regions.length > 0).map((page) => (
                        <div key={`trufor-${page.pageNumber}`} className="space-y-2">
                          <p className="text-label-md text-on-surface">Zones suspectes (Vision) — page {page.pageNumber}</p>
                          <img src={page.markedImageBase64} alt={`Analyse visuelle de la page ${page.pageNumber}`} className="max-h-[36rem] w-full rounded-md border border-border object-contain" />
                        </div>
                      ))}

                      {false && fraud.elaVisuals.filter((visual) => visual.isSuspicious).map((visual) => (
                        <div key={visual.pageNumber} className="space-y-2">
                          <p className="text-label-md text-on-surface">
                            Zones suspectes (ELA) — page {visual.pageNumber}
                          </p>
                          <img
                            src={visual.markedImageBase64}
                            alt={`Page ${visual.pageNumber}, zones suspectes encadrées`}
                            className="max-h-[36rem] w-full rounded-md border border-border object-contain"
                          />
                        </div>
                      ))}
                    </div>

                    <details className="group space-y-3 rounded-lg border border-border p-3">
                      <summary className="cursor-pointer text-label-md text-on-surface-variant font-medium hover:text-on-surface">
                        Voir les explications de la fraude
                      </summary>
                      
                      <div className="pt-3 space-y-4">
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

                        {fraud.contributions && fraud.contributions.length > 0 && (
                          <ul className="space-y-2 text-body-sm text-on-surface">
                            {fraud.contributions.map((contribution) => (
                              <li key={contribution.detector}>
                                <strong>{detectorLabel[contribution.detector] ?? contribution.detector}</strong> : {contribution.explanation}
                                {' '}(contribution {Math.round(contribution.contribution * 100)} %, confiance {Math.round(contribution.confidence * 100)} %).
                              </li>
                            ))}
                          </ul>
                        )}

                        {fraud.integrity && (
                          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-body-sm sm:grid-cols-2">
                            <dt className="text-on-surface-variant">Empreinte du fichier</dt>
                            <dd className="break-all text-on-surface">{fraud.integrity.contentHash.slice(0, 16)}…</dd>
                            <dt className="text-on-surface-variant">QR code</dt>
                            <dd className="text-on-surface">{fraud.integrity.qrCodesDetected || 'Aucun détecté'}</dd>
                            <dt className="text-on-surface-variant">MRZ</dt>
                            <dd className="text-on-surface">
                              {!fraud.integrity.mrzDetected
                                ? 'Non détectée'
                                : fraud.integrity.mrzChecksumValid ? 'Checksum valide' : 'Checksum à vérifier'}
                            </dd>
                            <dt className="text-on-surface-variant">Signature PDF</dt>
                            <dd className="text-on-surface">{fraud.integrity.pdfSignatureState}</dd>
                          </dl>
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
                    </details>
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
