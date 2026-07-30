/**
 * CV coach (France Travail) — mirrors the backend
 * `app.modules.ai.cv_coach.schemas.CvReviewResult` field for field.
 *
 * The chat side has no dedicated type here: it reuses `ChatbotMessage`
 * (`features/chatbot/types/chatbot.ts`) so the existing chat UI needs no
 * changes — only `review()`'s one-shot result is new.
 */
export interface CvReviewResult {
  /** False whenever no real review ran — every other field is then empty. */
  available: boolean;
  unavailableReason: string | null;
  pointsForts: string[];
  pointsAAmeliorer: string[];
  conseils: string[];
}
