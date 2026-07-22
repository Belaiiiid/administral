import { useCallback, useState } from 'react';

import type { CaseDecision } from '@/types';
import { agentDecisionService } from '@/features/agent/services';

export interface CaseDecisionController {
  /** The recorded decision, once one has been taken in this session. */
  decision: CaseDecision | null;
  /** True while a decision is being submitted — disables both actions. */
  isSubmitting: boolean;
  /**
   * A refused or failed decision. `MissingEvidenceError` lands here when an
   * agent tries to reject a case that presents no verifiable defect.
   */
  error: Error | null;
  approve: () => void;
  reject: () => void;
}

/**
 * Command hook for the validation screen.
 *
 * Deliberately separate from `useAsyncResource`: that hook models a *read* that
 * runs on mount, this models a *write* that runs on an agent's explicit
 * gesture. Forcing a write through fetch-on-mount semantics is how a decision
 * ends up being taken by a re-render.
 *
 * All the hook does is call the service and hold the result. It does not choose
 * an outcome, extract evidence, compose a message or decide whether a rejection
 * is permissible — those belong to the decision service, which today mocks the
 * backend and tomorrow is the backend.
 */
export function useCaseDecision(caseId: string | undefined): CaseDecisionController {
  const [decision, setDecision] = useState<CaseDecision | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    (action: (id: string) => Promise<CaseDecision>) => {
      if (!caseId || isSubmitting) return;

      setIsSubmitting(true);
      setError(null);

      action(caseId)
        .then(setDecision)
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        })
        .finally(() => setIsSubmitting(false));
    },
    [caseId, isSubmitting],
  );

  return {
    decision,
    isSubmitting,
    error,
    approve: useCallback(
      () => submit((id) => agentDecisionService.approveCase(id)),
      [submit],
    ),
    reject: useCallback(() => submit((id) => agentDecisionService.rejectCase(id)), [submit]),
  };
}
