import type { Contestation, ContestationStatus, ContestationSummary } from '@/types';
import { apiClient } from '@/services/apiClient';

/**
 * Agent-side contestation contract — the review queue for the droit de
 * contestation.
 *
 * Mirrors `agentCaseService`: interface first, transport second, so the pages
 * depend on this type and not on the endpoint. Reviewing and resolving are
 * commands (they move the challenge through its state machine); listing and
 * fetching are queries. The agent — never the AI — resolves a challenge.
 */
export interface AgentContestationService {
  /** The review queue. `GET /contestations`, optionally filtered by status. */
  list(status?: ContestationStatus): Promise<ContestationSummary[]>;
  /** One challenge in full. `GET /contestations/{id}`. */
  get(id: string): Promise<Contestation>;
  /** Take it into review (PENDING → UNDER_REVIEW). `PATCH .../review`. */
  review(id: string): Promise<Contestation>;
  /** Resolve it with a mandatory motive. `PATCH .../resolve`. */
  resolve(id: string, input: { accept: boolean; resolutionComment: string }): Promise<Contestation>;
}

export const httpAgentContestationService: AgentContestationService = {
  list: (status) =>
    apiClient.get<ContestationSummary[]>('/contestations', {
      params: { status },
    }),

  get: (id) => apiClient.get<Contestation>(`/contestations/${encodeURIComponent(id)}`),

  review: (id) =>
    apiClient.patch<Contestation>(`/contestations/${encodeURIComponent(id)}/review`),

  resolve: (id, { accept, resolutionComment }) =>
    apiClient.patch<Contestation>(`/contestations/${encodeURIComponent(id)}/resolve`, {
      accept,
      resolutionComment,
    }),
};
