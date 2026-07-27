import { apiClient } from '@/services/apiClient';

/**
 * Agent-side access to the immutable audit trail.
 *
 * The trail is read-only from the frontend by design — there is no write path
 * here, because events are written only server-side, inside the domain flows
 * they record (submission, decision, profile edit). This service just reads a
 * dossier's history for the assisted review, mirroring `agentCaseService`.
 */

/** One recorded action, as served by `GET /api/audit/{entityType}/{entityId}`. */
export interface AuditEvent {
  id: number;
  occurredAt: string;
  actorUserId: number | null;
  actorRole: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  summary: string;
  payload: Record<string, unknown>;
  previousHash: string;
  eventHash: string;
}

export type AuditAction =
  | 'dossier_submitted'
  | 'decision_recorded'
  | 'profile_updated'
  | 'contestation_created'
  | 'contestation_review_started'
  | 'contestation_resolved';

export interface AuditTrail {
  entityType: string;
  entityId: string;
  events: AuditEvent[];
  /** Whether the global hash chain still verifies — surfaced next to the trail. */
  chainIntact: boolean;
}

export interface AgentAuditService {
  /** The full history for one entity, oldest first. */
  getTrail(entityType: string, entityId: string): Promise<AuditTrail>;
}

export const httpAgentAuditService: AgentAuditService = {
  getTrail: (entityType, entityId) =>
    apiClient.get<AuditTrail>(
      `/audit/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    ),
};
