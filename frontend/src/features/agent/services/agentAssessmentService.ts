import { apiClient } from '@/services/apiClient';

/**
 * Agent-side access to the MonParcours Result — the unified, deterministic
 * assessment of a dossier.
 *
 * Read-only: the score is computed server-side by rule (no client arithmetic,
 * no LLM), so this just fetches it. It is decision *support* — the agent, never
 * this service, decides eligibility.
 */

/** One of the four axes of the assessment. */
export interface CategoryAssessment {
  score: number;
  status: string;
  explanation: string;
  evidence: string[];
  /** Weight in the global score (0–1), surfaced for transparency. */
  weight: number;
}

export interface MonParcoursResult {
  score: number;
  /** Decision-support band — `favorable` | `vigilance` | `defavorable`. Not eligibility. */
  band: string;
  completeness: CategoryAssessment;
  coherence: CategoryAssessment;
  documentQuality: CategoryAssessment;
  vigilance: CategoryAssessment;
  recommendedActions: string[];
  computedAt: string | null;
  disclaimer: string;
}

export interface AgentAssessmentService {
  /** The dossier's MonParcours Result. `GET /agent/cases/{id}/assessment`. */
  getAssessment(caseId: string): Promise<MonParcoursResult>;
}

export const httpAgentAssessmentService: AgentAssessmentService = {
  getAssessment: (caseId) =>
    apiClient.get<MonParcoursResult>(`/agent/cases/${encodeURIComponent(caseId)}/assessment`),
};
