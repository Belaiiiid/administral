import { Eye, FileText, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import { EmptyState, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { CaseDocument } from '@/types';
import { CaseDocumentViewer } from '@/features/agent/cases/components/CaseDocumentViewer';
import {
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_TONE,
  formatFileSize,
  fraudRiskTone,
} from '@/features/agent/lib/casePresentation';

export interface CaseDocumentsCardProps {
  documents: CaseDocument[];
  /**
   * Scopes the file requests: a piece is fetched through its case, never by id
   * alone. Optional so a caller that only lists pieces can omit it — the
   * "Consulter" action then does not render, rather than failing on click.
   */
  caseId?: string;
}

/**
 * Supporting documents attached to the case.
 *
 * The status on each file was decided by the analysis pipeline before the case
 * reached this portal — no OCR, no re-validation and no re-analysis is
 * triggered from here. Opening a piece is likewise read-only: the agent sees
 * the same bytes the pipeline saw, and the dossier is unchanged by the reading.
 */
export function CaseDocumentsCard({ documents, caseId }: CaseDocumentsCardProps) {
  /*
   * The open piece, held here rather than in the viewer: one dialog is mounted
   * for the whole list, so switching from one document to the next swaps the
   * fetch instead of remounting — and only one object URL is ever alive.
   */
  const [openDocument, setOpenDocument] = useState<CaseDocument | null>(null);

  return (
    <Card>
      <CardHeader>
        <SectionHeader title={`Pièces justificatives (${documents.length})`} as="h2" />
      </CardHeader>
      <CardContent className={documents.length === 0 ? 'px-0' : undefined}>
        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucune pièce"
            description="Aucun document n’est rattaché à ce dossier."
            size="compact"
          />
        ) : (
          <ul className="space-y-3">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-surface-low px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-label-md text-on-surface">{document.requirementLabel}</p>
                  <p className="truncate text-body-sm text-on-surface-variant">
                    {document.fileName} · {formatFileSize(document.sizeBytes)} · déposé le{' '}
                    {formatDate(document.uploadedAt)}
                  </p>
                  {document.errorMessage && (
                    <p className="mt-1 text-body-sm text-destructive">{document.errorMessage}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Authenticity flag only when C4 found something — a badge on
                      every clean file would drown the signal. */}
                  {document.fraudRisk && document.fraudRisk !== 'FAIBLE' && (
                    <Badge tone={fraudRiskTone(document.fraudRisk)}>
                      <ShieldAlert aria-hidden="true" />
                      {document.fraudRisk}
                    </Badge>
                  )}
                  <Badge tone={DOCUMENT_STATUS_TONE[document.status]}>
                    {DOCUMENT_STATUS_LABEL[document.status]}
                  </Badge>
                  {caseId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpenDocument(document)}
                      // The label names the piece: with one button per row, a
                      // bare "Consulter" repeated eight times tells a screen
                      // reader nothing about which one it lands on.
                      aria-label={`Consulter ${document.requirementLabel} — ${document.fileName}`}
                    >
                      <Eye aria-hidden="true" />
                      Consulter
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {caseId && (
        <CaseDocumentViewer
          caseId={caseId}
          document={openDocument}
          onClose={() => setOpenDocument(null)}
        />
      )}
    </Card>
  );
}
