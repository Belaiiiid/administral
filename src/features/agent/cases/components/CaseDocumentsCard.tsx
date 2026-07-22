import { FileText } from 'lucide-react';

import { EmptyState, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { CaseDocument } from '@/types';
import {
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_TONE,
  formatFileSize,
} from '@/features/agent/lib/casePresentation';

export interface CaseDocumentsCardProps {
  documents: CaseDocument[];
}

/**
 * Supporting documents attached to the case.
 *
 * Listing only. The status on each file was decided by the analysis pipeline
 * before the case reached this portal — no OCR, no re-validation and no
 * re-analysis is triggered from here.
 */
export function CaseDocumentsCard({ documents }: CaseDocumentsCardProps) {
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
                <Badge tone={DOCUMENT_STATUS_TONE[document.status]}>
                  {DOCUMENT_STATUS_LABEL[document.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
