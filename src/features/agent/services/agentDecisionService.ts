import type { CaseDecision } from '@/types';

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

const notImplemented = (method: string) => (): never => {
  throw new Error(
    `agentDecisionService.${method}() sera implémenté par le module full-stack Agent.`,
  );
};

/**
 * The real implementation, pending.
 *
 * When the backend lands, each method is one `apiClient` call. Note the wire
 * vocabulary differs from the domain vocabulary — the mapping lives here and
 * nowhere else:
 *
 *   approveCase: (caseId) =>
 *     apiClient
 *       .post<DecisionResponseDto>(`/agent/cases/${caseId}/decision`, { decision: 'APPROVED' })
 *       .then(toCaseDecision),
 *
 * Evidence extraction and explanation generation happen server-side, so the
 * response already carries `message` and `evidenceUsed`. The frontend gains no
 * new responsibility at cutover — it loses one (the mock's local composition).
 */
export const httpDecisionService: AgentDecisionService = {
  approveCase: notImplemented('approveCase'),
  rejectCase: notImplemented('rejectCase'),
};
