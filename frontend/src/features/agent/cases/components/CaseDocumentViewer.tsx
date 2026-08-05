import { AlertCircle, Download, ExternalLink, FileQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';
import { useCaseDocumentFile } from '@/features/agent/hooks';
import { formatFileSize } from '@/features/agent/lib/casePresentation';
import type { CaseDocument } from '@/types';

export interface CaseDocumentViewerProps {
  caseId: string;
  /** The piece to display, or `null` when the viewer is closed. */
  document: CaseDocument | null;
  onClose: () => void;
}

/** PDFs render in a frame, images in a tag; anything else offers a download. */
const isPdf = (mimeType: string | null) => Boolean(mimeType?.includes('pdf'));
const isImage = (mimeType: string | null) => Boolean(mimeType?.startsWith('image/'));

/**
 * Reads one supporting document, in place.
 *
 * The agent portal could previously only *list* pieces — an agent instructing a
 * dossier had to trust the pipeline's verdict on a file they could not open.
 * This is the missing half: the same evidence the analysis saw, readable by the
 * human who signs the decision.
 *
 * The file is fetched authenticated and rendered from an object URL, never from
 * the API path: the endpoint is behind `require_agent` and the bearer token
 * lives in a header, which no `src` attribute carries. `useCaseDocumentFile`
 * owns that URL's lifetime.
 *
 * Read-only, like every agent panel: nothing here re-analyses, re-classifies or
 * annotates. Opening a piece is not an act on the dossier.
 */
export function CaseDocumentViewer({ caseId, document, onClose }: CaseDocumentViewerProps) {
  const file = useCaseDocumentFile(caseId, document?.id ?? null);

  return (
    <Dialog open={document !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-4 overflow-hidden">
        {document && (
          <>
            <DialogHeader>
              <DialogTitle>{document.requirementLabel}</DialogTitle>
              <DialogDescription>
                {document.fileName} · {formatFileSize(document.sizeBytes)} · déposé le{' '}
                {formatDate(document.uploadedAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-border bg-surface-container">
              {file.isLoading && <Skeleton className="size-full" />}

              {file.error && (
                <div className="flex max-w-md flex-col items-center gap-3 p-8 text-center">
                  <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
                  <p className="text-label-md text-on-surface">Pièce non consultable</p>
                  <p className="text-body-sm text-on-surface-variant">{file.error}</p>
                </div>
              )}

              {file.url && isPdf(file.mimeType) && (
                <iframe
                  src={file.url}
                  title={`${document.requirementLabel} — ${document.fileName}`}
                  className="size-full border-0"
                />
              )}

              {file.url && isImage(file.mimeType) && (
                <img
                  src={file.url}
                  alt={`${document.requirementLabel} — ${document.fileName}`}
                  className="max-h-full max-w-full object-contain"
                />
              )}

              {/* Office files, archives, anything the browser will not render:
                  say so and hand over the file rather than showing a blank
                  frame the agent would read as a broken page. */}
              {file.url && !isPdf(file.mimeType) && !isImage(file.mimeType) && (
                <div className="flex max-w-md flex-col items-center gap-3 p-8 text-center">
                  <FileQuestion className="size-8 text-on-surface-variant" aria-hidden="true" />
                  <p className="text-label-md text-on-surface">
                    Ce format ne s’affiche pas dans le navigateur
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    {document.mimeType} — téléchargez la pièce pour la consulter.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" asChild disabled={!file.url}>
                {/* `download` names the file the citizen uploaded, not the
                    server's UUID; `rel=noopener` on the new-tab link because
                    a blob URL still opens a browsing context. */}
                <a href={file.url ?? '#'} download={document.fileName}>
                  <Download aria-hidden="true" />
                  Télécharger
                </a>
              </Button>
              <Button variant="outline" asChild disabled={!file.url}>
                <a href={file.url ?? '#'} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Ouvrir dans un onglet
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
