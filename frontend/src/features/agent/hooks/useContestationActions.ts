import { useCallback, useState } from 'react';

import type { Contestation } from '@/types';
import { agentContestationService } from '@/features/agent/services';

export interface ContestationActionController {
  /** True while a review/resolve call is in flight — disables the controls. */
  isSubmitting: boolean;
  error: Error | null;
  /** Take the challenge into review (PENDING → UNDER_REVIEW). */
  review: () => void;
  /** Resolve it, accepted or rejected, with a mandatory motive. */
  resolve: (input: { accept: boolean; resolutionComment: string }) => void;
}

/**
 * Command hook for the contestation detail screen.
 *
 * Separate from `useContestation` (a read) for the same reason `useCaseDecision`
 * is separate from the case read: review and resolve are *writes* triggered by
 * an agent's gesture, not fetch-on-mount. On success it invokes `onDone` so the
 * page refetches and shows the new state; the hook itself holds no domain rule —
 * the state machine and the mandatory motive are enforced server-side.
 */
export function useContestationActions(
  id: string | undefined,
  onDone: (updated: Contestation) => void,
): ContestationActionController {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(
    (action: (id: string) => Promise<Contestation>) => {
      if (!id || isSubmitting) return;
      setIsSubmitting(true);
      setError(null);
      action(id)
        .then(onDone)
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause : new Error(String(cause))),
        )
        .finally(() => setIsSubmitting(false));
    },
    [id, isSubmitting, onDone],
  );

  return {
    isSubmitting,
    error,
    review: useCallback(() => run((cid) => agentContestationService.review(cid)), [run]),
    resolve: useCallback(
      (input) => run((cid) => agentContestationService.resolve(cid, input)),
      [run],
    ),
  };
}
