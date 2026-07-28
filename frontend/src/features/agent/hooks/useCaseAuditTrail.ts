import { agentAuditService, type AuditTrail } from '@/features/agent/services';
import { useAsyncResource, type AsyncResource } from '@/features/agent/hooks/useAsyncResource';

/**
 * A case's audit trail. Backs `GET /api/audit/case/{applicationNumber}`.
 *
 * The dossier's history — submission, decision, and any profile edits — as an
 * immutable, hash-chained record. The component renders `data.events` and
 * surfaces `data.chainIntact`; it never writes, because the trail has no write
 * path from the client.
 */
export function useCaseAuditTrail(
  applicationNumber: string | undefined,
): AsyncResource<AuditTrail> {
  return useAsyncResource<AuditTrail>(
    () =>
      applicationNumber
        ? agentAuditService.getTrail('case', applicationNumber)
        : Promise.reject(new Error('Aucune référence de dossier fournie.')),
    [applicationNumber],
  );
}
