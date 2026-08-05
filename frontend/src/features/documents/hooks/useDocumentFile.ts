import { useEffect, useState } from 'react';

import { ApiClientError } from '@/services/apiClient';
import { documentService } from '@/services/documentService';

export interface DocumentFile {
  /** Object URL for the fetched bytes, or `null` until the fetch resolves. */
  url: string | null;
  /** Mime type as recorded at upload — decides how the viewer renders. */
  mimeType: string | null;
  isLoading: boolean;
  /** A readable sentence, already normalised by `apiClient`. */
  error: string | null;
}

const IDLE: DocumentFile = { url: null, mimeType: null, isLoading: false, error: null };

/**
 * Fetches one deposited document and exposes it as an object URL.
 *
 * The citizen counterpart of `useCaseDocumentFile` — same shape, different
 * endpoint, and deliberately not shared: the two features are isolated by the
 * module rule, and a common hook would make `features/documents` depend on
 * `features/agent`.
 *
 * Pass `documentId: null` when nothing is open. The object URL is revoked when
 * the document changes and on unmount, and a response arriving after the
 * selection moved on is dropped rather than replacing what is on screen.
 *
 * `applicationId` must be the one the documents were listed with: the server
 * resolves the piece through its dossier, and the fallback demo dossier will not
 * match a real application's documents.
 */
export function useDocumentFile(
  documentId: string | null,
  applicationId?: string,
): DocumentFile {
  const [state, setState] = useState<DocumentFile>(IDLE);

  useEffect(() => {
    if (!documentId) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    setState({ ...IDLE, isLoading: true });

    documentService
      .getFile(documentId, applicationId)
      .then(({ blob, mimeType }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, mimeType, isLoading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          ...IDLE,
          error:
            cause instanceof ApiClientError
              ? cause.payload.message
              : 'Cette pièce n’a pas pu être ouverte.',
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, applicationId]);

  return state;
}
