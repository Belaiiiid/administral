import type { Case, CaseDecision, DecisionOutcome } from '@/types';
import {
  MissingEvidenceError,
  type AgentDecisionService,
} from '@/features/agent/services/agentDecisionService';
import { CASE_FIXTURES } from '@/features/agent/data/fixtures';
import { CaseNotFoundError } from '@/features/agent/data/mockAgentCaseService';
import {
  extractBlockingEvidence,
  extractSupportingEvidence,
} from '@/features/agent/data/evidenceExtraction';
import { mockExplanationService } from '@/features/agent/data/mockExplanationService';

/**
 * Fixture-stage stand-in for the backend's decision endpoint.
 *
 * Reproduces the server-side sequence in order, because that order is the
 * contract the real implementation must also honour:
 *
 *   1. load the case
 *   2. extract evidence from it
 *   3. refuse a rejection that no evidence supports
 *   4. formulate the explanation from that evidence
 *   5. persist decision + status transition
 *
 * Steps 2–4 are the backend's work, mocked here. Doing them in the browser is
 * acceptable only because it is fixtures; at cutover the whole chain moves
 * behind `POST /agent/cases/{id}/decision` and this file is deleted with the
 * rest of `data/`. Nothing above the service layer learns of the change,
 * because nothing above the service layer ever saw these steps.
 */

/**
 * Until an auth module exists there is no real agent identity, and inventing a
 * plausible name would put a fake civil servant's name on a decision record.
 */
const DEMO_AGENT = 'Agent (démonstration)';

let decisionCounter = 0;

const findCase = (caseId: string): Case => {
  const found = CASE_FIXTURES.find((item) => item.id === caseId);
  if (!found) throw new CaseNotFoundError(caseId);
  return found;
};

/**
 * Writes the decision onto the in-memory fixture.
 *
 * Stands in for the backend's `UPDATE`, and is what makes the workflow
 * observable end to end: a decided case leaves the validation queue and shows
 * its outcome on the case detail screen. The mutation lasts for the session
 * only — a reload restores the original fixtures.
 */
const persist = (caseRecord: Case, decision: CaseDecision): void => {
  caseRecord.status = decision.outcome;
  caseRecord.decision = decision;
};

const decide = async (caseId: string, outcome: DecisionOutcome): Promise<CaseDecision> => {
  const caseRecord = findCase(caseId);

  const evidence =
    outcome === 'rejected'
      ? extractBlockingEvidence(caseRecord)
      : extractSupportingEvidence(caseRecord);

  /*
   * The business rule, enforced before anything is written or generated: a
   * rejection with nothing behind it is refused outright rather than explained
   * vaguely. This is why a clean case cannot be rejected through this path.
   */
  if (outcome === 'rejected' && evidence.length === 0) {
    throw new MissingEvidenceError(caseId);
  }

  const { message, evidenceUsed } = await mockExplanationService.generateExplanation(
    outcome,
    evidence,
  );

  const decision: CaseDecision = {
    id: `decision-${++decisionCounter}-${caseId}`,
    caseId,
    outcome,
    explanation: message,
    evidenceUsed,
    createdAt: new Date().toISOString(),
    decidedBy: DEMO_AGENT,
  };

  persist(caseRecord, decision);
  return decision;
};

export const mockDecisionService: AgentDecisionService = {
  approveCase: (caseId) => decide(caseId, 'validated'),
  rejectCase: (caseId) => decide(caseId, 'rejected'),
};
