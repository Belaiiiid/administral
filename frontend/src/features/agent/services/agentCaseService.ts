import type { Case, CaseQueueStats, CaseSummary } from '@/types';

/**
 * Agent-side case access contract.
 *
 * Mirrors the shape of the citizen services in `src/services/` — interface
 * first, transport second — so the UI depends on this type and never on where
 * the data comes from. Swapping fixtures for REST is a one-line change in
 * `services/index.ts`; no page, component or hook is touched.
 */
export interface AgentCaseService {
  /** Instruction queue. Future endpoint: `GET /agent/cases`. */
  listCases(query?: CaseQuery): Promise<CaseSummary[]>;
  /** One case in full. Future endpoint: `GET /agent/cases/{id}`. */
  getCase(id: string): Promise<Case>;
  /** Dashboard workload counters. Future endpoint: `GET /agent/cases/stats`. */
  getQueueStats(): Promise<CaseQueueStats>;
}

/** Server-side filtering for the queue — never applied in the browser. */
export interface CaseQuery {
  status?: string;
  /** Free-text search across reference and applicant name. */
  search?: string;
  /**
   * Restricts the result to cases still awaiting an agent decision.
   *
   * A semantic flag rather than a list of statuses on purpose: *which* statuses
   * count as undecided is a business rule, and the caller enumerating them
   * would put that rule in a page. The service owns it, so it is stated once
   * and the validation queue and the dashboard counters cannot disagree.
   */
  pendingDecision?: boolean;
}

const notImplemented = (method: string) => (): never => {
  throw new Error(
    `agentCaseService.${method}() sera implémenté par le module full-stack Agent.`,
  );
};

/**
 * The real implementation, pending.
 *
 * When the backend lands, each method becomes a single `apiClient` call plus a
 * DTO→domain mapping:
 *
 *   listCases: (query) =>
 *     apiClient.get<CaseSummaryDto[]>('/agent/cases', { params: query })
 *       .then((dtos) => dtos.map(toCaseSummary)),
 *
 * `apiClient` already exists (`src/services/apiClient.ts`) and already throws
 * until its `request()` is written — so this file needs no other scaffolding.
 */
export const httpAgentCaseService: AgentCaseService = {
  listCases: notImplemented('listCases'),
  getCase: notImplemented('getCase'),
  getQueueStats: notImplemented('getQueueStats'),
};
