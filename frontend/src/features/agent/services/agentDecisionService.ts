import type { CaseDecision, DecisionOutcome } from '@/types';
import { ApiClientError, apiClient } from '@/services/apiClient';

/**
 * Agent decision contract.
 *
 * The only surface through which a decision may be taken. Components call the
 * hook, the hook calls this — no page assembles a `CaseDecision`, chooses an
 * outcome, or composes an explanation.
 *
 * Both methods are commands, not queries: they record the agent's decision and
 * return the resulting record, explanation included.
 */
export interface AgentDecisionService {
  /** Future endpoint: `POST /agent/cases/{id}/decision` with `{ decision: 'APPROVED' }`. */
  approveCase(caseId: string): Promise<CaseDecision>;
  /** Future endpoint: `POST /agent/cases/{id}/decision` with `{ decision: 'REJECTED' }`. */
  rejectCase(caseId: string): Promise<CaseDecision>;
}

/**
 * Raised when a rejection cannot be justified by anything in the case.
 *
 * The business rule is that evidence is mandatory for a rejection. Enforcing it
 * as a thrown error rather than a silent empty array means a case with no
 * blocking findings *cannot* be rejected with an unsupported explanation — the
 * attempt fails loudly and the agent sees why.
 */
export class MissingEvidenceError extends Error {
  constructor(caseId: string) {
    super(
      'Ce dossier ne présente aucun motif de rejet vérifiable : ' +
        'aucune pièce manquante, aucune incohérence relevée. ' +
        'Un rejet doit s’appuyer sur un élément du dossier.',
    );
    this.name = 'MissingEvidenceError';
    this.caseId = caseId;
  }

  readonly caseId: string;
}

/**
 * Sends the decision and translates the one domain failure back into its type.
 *
 * Evidence extraction and explanation generation happen server-side, so the
 * response already carries `explanation` and `evidenceUsed`. The frontend
 * gained no responsibility at cutover — it lost one.
 *
 * The wire uses the same lowercase vocabulary as `DecisionOutcome`
 * (`validated` / `rejected`) rather than an APPROVED/REJECTED enum, so there is
 * no translation table between a decision and the status transition it causes.
 */
const decide = async (caseId: string, outcome: DecisionOutcome): Promise<CaseDecision> => {
  try {
    return await apiClient.post<CaseDecision>(
      `/agent/cases/${encodeURIComponent(caseId)}/decision`,
      { outcome },
    );
  } catch (cause) {
    /*
     * A refused rejection is a *domain* outcome, not a transport failure: the
     * case simply presents nothing to reject. Restoring its own error type here
     * means `DecisionPanel` can keep distinguishing it from a network fault
     * without inspecting HTTP status codes.
     */
    if (
      cause instanceof ApiClientError &&
      cause.status === 400 &&
      outcome === 'rejected'
    ) {
      throw new MissingEvidenceError(caseId);
    }
    throw cause;
  }
};

export const httpDecisionService: AgentDecisionService = {
  approveCase: (caseId) => decide(caseId, 'validated'),
  rejectCase: (caseId) => decide(caseId, 'rejected'),
};
