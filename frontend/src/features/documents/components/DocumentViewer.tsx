import { AlertCircle, Download, ExternalLink, FileQuestion } from 'lucide-react';

import { citizenButton } from '@/components/citizen/citizenButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentFile } from '@/features/documents/hooks/useDocumentFile';
import type { CitizenDocument } from '@/types';

export interface DocumentViewerProps {
  /** The piece to display, or `null` when the viewer is closed. */
  document: CitizenDocument | null;
  /**
   * The dossier the piece was listed from. Required whenever the caller reads a
   * real application: the server resolves the file through its dossier, so
   * omitting it falls back to the demo dossier and the fetch is refused.
   */
  applicationId?: string;
  onClose: () => void;
}

const isPdf = (mimeType: string | null) => Boolean(mimeType?.includes('pdf'));
const isImage = (mimeType: string | null) => Boolean(mimeType?.startsWith('image/'));

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR');
}

/**
 * Re-read a piece you deposited.
 *
 * Only offered for a document the classifier matched to a checklist line — a
 * file it could not place is not yet a piece of the dossier. The server applies
 * the same rule, so hiding the button is a courtesy and not the guard.
 *
 * The file is fetched authenticated and rendered from an object URL, never from
 * the API path: the route is behind the citizen guard and the bearer token
 * lives in a header, which no `src` attribute carries.
 */
export function DocumentViewer({ document, applicationId, onClose }: DocumentViewerProps) {
  const file = useDocumentFile(document?.id ?? null, applicationId);

  return (
    <Dialog open={document !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[90vh] max-w-4xl flex-col gap-4 overflow-hidden">
        {document && (
          <>
            <DialogHeader>
              <DialogTitle>{document.fileName}</DialogTitle>
              <DialogDescription>
                Déposé le {formatDate(document.uploadedAt)} · {document.mimeType}
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-border/60 bg-surface">
              {file.isLoading && <Skeleton className="size-full" />}

              {file.error && (
                <div className="flex max-w-md flex-col items-center gap-3 p-8 text-center">
                  <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
                  <p className="text-label-md text-foreground">Pièce non consultable</p>
                  <p className="text-body-sm text-muted-foreground">{file.error}</p>
                </div>
              )}

              {file.url && isPdf(file.mimeType) && (
                <iframe src={file.url} title={document.fileName} className="size-full border-0" />
              )}

              {file.url && isImage(file.mimeType) && (
                <img
                  src={file.url}
                  alt={`Pièce déposée : ${document.fileName}`}
                  className="max-h-full max-w-full object-contain"
                />
              )}

              {file.url && !isPdf(file.mimeType) && !isImage(file.mimeType) && (
                <div className="flex max-w-md flex-col items-center gap-3 p-8 text-center">
                  <FileQuestion className="size-8 text-muted-foreground" aria-hidden="true" />
                  <p className="text-label-md text-foreground">
                    Ce format ne s’affiche pas dans le navigateur
                  </p>
                  <p className="text-body-sm text-muted-foreground">
                    Téléchargez la pièce pour la consulter.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <a
                href={file.url ?? '#'}
                download={document.fileName}
                aria-disabled={!file.url}
                className={citizenButton({ variant: 'ghost' })}
              >
                <Download aria-hidden="true" />
                Télécharger
              </a>
              <a
                href={file.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!file.url}
                className={citizenButton({ variant: 'ghost' })}
              >
                <ExternalLink aria-hidden="true" />
                Ouvrir dans un onglet
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
