import { useEffect, useState } from 'react';

import { ApiClientError } from '@/services/apiClient';
import { agentCaseService } from '@/features/agent/services';

export interface CaseDocumentFile {
  /** Object URL for the fetched bytes, or `null` until the fetch resolves. */
  url: string | null;
  /** Mime type as recorded at upload — decides how the viewer renders. */
  mimeType: string | null;
  isLoading: boolean;
  /** A readable sentence, already normalised by `apiClient`. */
  error: string | null;
}

const IDLE: CaseDocumentFile = { url: null, mimeType: null, isLoading: false, error: null };

/**
 * Fetches one case document and exposes it as an object URL.
 *
 * Pass `documentId: null` when nothing is open — the hook then does nothing and
 * holds no URL, which is what lets the viewer dialog mount once and switch
 * documents rather than remounting per file.
 *
 * The object URL is revoked when the document changes and when the component
 * unmounts. Without that, every opened piece would pin its bytes in memory for
 * the lifetime of the tab; an agent reviewing a queue opens a lot of them.
 *
 * A fetch still in flight when the selection changes is ignored on arrival (the
 * `cancelled` flag) and its URL is never created — the late response of a
 * document the agent has already navigated away from must not replace the one
 * now on screen.
 */
export function useCaseDocumentFile(
  caseId: string | undefined,
  documentId: string | null,
): CaseDocumentFile {
  const [state, setState] = useState<CaseDocumentFile>(IDLE);

  useEffect(() => {
    if (!caseId || !documentId) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    setState({ ...IDLE, isLoading: true });

    agentCaseService
      .getDocumentFile(caseId, documentId)
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
  }, [caseId, documentId]);

  return state;
}
