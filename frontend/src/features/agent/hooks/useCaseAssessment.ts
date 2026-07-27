import { agentAssessmentService, type MonParcoursResult } from '@/features/agent/services';
import { useAsyncResource, type AsyncResource } from '@/features/agent/hooks/useAsyncResource';

/**
 * A case's MonParcours Result. Backs `GET /api/agent/cases/{id}/assessment`.
 *
 * The unified, deterministic assessment (completeness / coherence / document
 * quality / vigilance) the agent reads before deciding. A pure read — the score
 * is computed server-side by rule; the component renders it and never recomputes.
 */
export function useCaseAssessment(caseId: string | undefined): AsyncResource<MonParcoursResult> {
  return useAsyncResource<MonParcoursResult>(
    () =>
      caseId
        ? agentAssessmentService.getAssessment(caseId)
        : Promise.reject(new Error('Aucun dossier indiqué.')),
    [caseId],
  );
}
