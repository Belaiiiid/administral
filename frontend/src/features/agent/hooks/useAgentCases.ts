import type { Case, CaseQueueStats, CaseSummary } from '@/types';
import { agentCaseService, type CaseQuery } from '@/features/agent/services';
import { useAsyncResource, type AsyncResource } from '@/features/agent/hooks/useAsyncResource';

/**
 * The instruction queue. Backs `GET /agent/cases`.
 *
 * Components call this and render `data`; they never touch the service, and
 * never learn where the rows came from.
 */
export function useAgentCases(query: CaseQuery = {}): AsyncResource<CaseSummary[]> {
  const { status, search, pendingDecision } = query;

  return useAsyncResource<CaseSummary[]>(
    () => agentCaseService.listCases({ status, search, pendingDecision }),
    // Primitives, not the object literal — otherwise a fresh `{}` on every
    // render would re-fetch in a loop.
    [status, search, pendingDecision],
  );
}

/** Dashboard workload counters. Backs `GET /agent/cases/stats`. */
export function useAgentQueueStats(): AsyncResource<CaseQueueStats> {
  return useAsyncResource<CaseQueueStats>(() => agentCaseService.getQueueStats(), []);
}

/** One case in full. Backs `GET /agent/cases/{id}`. */
export function useAgentCase(id: string | undefined): AsyncResource<Case> {
  return useAsyncResource<Case>(
    () =>
      id
        ? agentCaseService.getCase(id)
        : Promise.reject(new Error('Aucun identifiant de dossier fourni.')),
    [id],
  );
}
