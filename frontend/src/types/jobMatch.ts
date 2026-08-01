/**
 * Job-offer match analysis (France Travail) — mirrors the backend
 * `app.modules.ai.job_match.schemas.JobMatchAnalysis` field for field.
 *
 * Stateless: this is the full response to one "analyze this CV against this
 * offer" request, nothing more is stored server-side.
 */
export interface JobMatchAnalysis {
  /** False whenever no real analysis ran — every other field is then empty. */
  available: boolean;
  unavailableReason: string | null;
  scorePourcentage: number | null;
  competencesRequises: string[];
  competencesCorrespondantes: string[];
  competencesManquantes: string[];
  documentsAPreparer: string[];
  explication: string | null;
}
