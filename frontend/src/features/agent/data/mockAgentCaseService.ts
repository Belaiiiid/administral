import type { Case, CaseQueueStats, CaseSummary } from '@/types';
import { CASE_FIXTURES } from '@/features/agent/data/fixtures';
import type { AgentCaseService, CaseQuery } from '@/features/agent/services/agentCaseService';

/**
 * Fixture-backed implementation of {@link AgentCaseService}.
 *
 * Stands in for the backend, and therefore does the backend's work: it owns the
 * `Case → CaseSummary` projection, the `waitingDays` computation and the query
 * filtering. Every one of those is a server responsibility in production — none
 * of them may migrate into a hook or a component, or replacing this adapter
 * with `httpAgentCaseService` would silently drop behaviour the UI relies on.
 *
 * Delete this file with `data/fixtures.ts` to remove all synthetic data.
 */

/** Simulates network latency so loading states are exercised during review. */
const LATENCY_MS = 320;

const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole days elapsed since submission. Server-side in production. */
const waitingDaysSince = (submittedAt: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / MS_PER_DAY));

/** The projection `GET /agent/cases` performs before serialising. */
const toSummary = (item: Case): CaseSummary => ({
  id: item.id,
  applicationNumber: item.applicationNumber,
  citizen: item.citizen,
  submittedAt: item.submittedAt,
  service: item.service,
  score: item.score,
  status: item.status,
  waitingDays: waitingDaysSince(item.submittedAt),
});

/**
 * A case still awaiting an agent decision.
 *
 * Defined negatively — anything not yet concluded — so a new intermediate
 * `CaseStatus` joins the validation queue by default instead of silently
 * vanishing from it, which is the safer failure direction for a queue whose
 * whole purpose is that nothing gets forgotten.
 *
 * Single source of truth for both the validation queue and the dashboard
 * counters.
 */
const isPendingDecision = (item: Case): boolean =>
  item.status !== 'validated' && item.status !== 'rejected';

const matches = (item: Case, query: CaseQuery): boolean => {
  if (query.status && item.status !== query.status) return false;
  if (query.pendingDecision && !isPendingDecision(item)) return false;
  if (query.search) {
    const haystack =
      `${item.applicationNumber} ${item.citizen.firstName} ${item.citizen.lastName}`.toLowerCase();
    if (!haystack.includes(query.search.trim().toLowerCase())) return false;
  }
  return true;
};

export class CaseNotFoundError extends Error {
  constructor(id: string) {
    super(`Aucun dossier ne correspond à l’identifiant « ${id} ».`);
    this.name = 'CaseNotFoundError';
  }
}

export const mockAgentCaseService: AgentCaseService = {
  listCases: (query = {}) =>
    delay(
      CASE_FIXTURES.filter((item) => matches(item, query))
        .map(toSummary)
        // Longest-waiting first — the order an instruction queue is worked in.
        .sort((a, b) => b.waitingDays - a.waitingDays),
    ),

  getCase: (id) => {
    const found = CASE_FIXTURES.find((item) => item.id === id);
    return found ? delay(found) : Promise.reject(new CaseNotFoundError(id));
  },

  /*
   * Aggregation the backend performs over the whole table — not over the page
   * the queue happens to be showing. Reproduced here for the same reason the
   * projection is: so the mock and the API agree on who computes what.
   */
  getQueueStats: (): Promise<CaseQueueStats> => {
    const open = CASE_FIXTURES.filter(isPendingDecision);

    return delay({
      pending: open.length,
      toReviewToday: open.filter((item) => item.status === 'ready_for_decision').length,
      citizensTracked: new Set(open.map((item) => item.citizen.id)).size,
    });
  },
};
