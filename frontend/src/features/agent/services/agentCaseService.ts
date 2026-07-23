import type { Case, CaseQueueStats, CaseSummary } from '@/types';
import { apiClient } from '@/services/apiClient';

/**
 * Agent-side case access contract.
 *
 * Mirrors the shape of the citizen services in `src/services/` — interface
 * first, transport second — so the UI depends on this type and never on where
 * the data comes from. The binding in `services/index.ts` selects the
 * implementation; no page, component or hook depends on which one.
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

/**
 * REST implementation, backed by the FastAPI service.
 *
 * No DTO→domain mapping layer: the API serialises `Case`, `CaseSummary` and
 * `CaseQueueStats` in exactly the shape declared in `src/types/case.ts`,
 * camelCase included. That is not a coincidence — those types were written as
 * the backend contract before the backend existed, and the Pydantic schemas
 * mirror them field for field.
 *
 * If the two ever drift, this is where a mapper belongs. Adding one
 * pre-emptively would be a translation layer that translates nothing.
 */
export const httpAgentCaseService: AgentCaseService = {
  listCases: (query = {}) =>
    apiClient.get<CaseSummary[]>('/agent/cases', {
      params: {
        status: query.status,
        search: query.search,
        // Omitted rather than sent as `false`: the backend treats the string
        // "false" as presence, so an explicit false would enable the filter.
        pendingDecision: query.pendingDecision ? true : undefined,
      },
    }),

  getCase: (id) => apiClient.get<Case>(`/agent/cases/${encodeURIComponent(id)}`),

  getQueueStats: () => apiClient.get<CaseQueueStats>('/agent/cases/stats'),
};
