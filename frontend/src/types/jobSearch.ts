/**
 * Job search (France Travail) — mirrors the backend
 * `app.modules.ai.job_search.schemas` field for field.
 *
 * Every offer here is real, sourced live from France Travail's own "Offres
 * d'emploi" API — `score`/`raison` are the only AI-derived fields, and are
 * `null` (never fabricated) whenever the relevance scoring step didn't run.
 */
export interface JobOffer {
  id: string;
  intitule: string;
  entreprise: string | null;
  lieuLibelle: string | null;
  typeContrat: string | null;
  description: string;
  /** The real France Travail application page for this offer. */
  url: string | null;
  score: number | null;
  raison: string | null;
}

export interface JobSearchResult {
  /** False only when the search itself couldn't run — never when it found nothing. */
  available: boolean;
  unavailableReason: string | null;
  motsCles: string | null;
  departement: string | null;
  offres: JobOffer[];
}
