import type { Contestation, ContestationStatus, ContestationSummary } from '@/types';
import { agentContestationService } from '@/features/agent/services';
import { useAsyncResource, type AsyncResource } from '@/features/agent/hooks/useAsyncResource';

/**
 * The contestation review queue. Backs `GET /contestations`.
 *
 * Filtering by status is applied by the server, never over an in-memory array —
 * the same rule the case queue follows.
 */
export function useContestations(
  status?: ContestationStatus,
): AsyncResource<ContestationSummary[]> {
  return useAsyncResource<ContestationSummary[]>(
    () => agentContestationService.list(status),
    [status],
  );
}

/**
 * One contestation in full. Backs `GET /contestations/{id}`.
 *
 * The `reloadToken` lets a review/resolve action force a refetch so the page
 * reflects the new state without a full navigation.
 */
export function useContestation(
  id: string | undefined,
  reloadToken?: number,
): AsyncResource<Contestation> {
  return useAsyncResource<Contestation>(
    () =>
      id
        ? agentContestationService.get(id)
        : Promise.reject(new Error('Aucune contestation indiquée.')),
    [id, reloadToken],
  );
}
