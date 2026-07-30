/**
 * The personalised dossier — the profile-driven checklist (Iteration 3).
 *
 * Mirrors the backend `app.modules.citizen.schemas.PersonalizedDossierSchema`
 * field for field, camelCase included. Distinct from the legacy
 * `PersonalizedChecklist` (`types/document.ts`): this one carries a per-item
 * `reason` and a three-state `status`, derived from the citizen's own profile.
 */

/** Document families, mirroring the backend `DocumentCategory`. */
export type DossierCategory = 'identite' | 'ressources' | 'logement' | 'famille' | 'autre';

/** Per-item state, derived from the citizen's uploads. */
export type DossierItemStatus = 'missing' | 'uploaded' | 'validated';

export interface DossierChecklistItem {
  /** Stable key the classifier targets, e.g. `contrat_location`. */
  documentType: string;
  libelle: string;
  categorie: DossierCategory;
  required: boolean;
  /** Why this piece is asked, grounded in the citizen's profile. */
  reason: string;
  status: DossierItemStatus;
  formatsAcceptes: string[];
}

export interface PersonalizedDossier {
  applicationId: string;
  versionChecklist: string;
  /** True once the profile is answered enough to tailor beyond the core. */
  profileComplete: boolean;
  status: 'complete' | 'incomplete';
  requiredReceivedCount: number;
  requiredDocumentCount: number;
  items: DossierChecklistItem[];
}

/** Category → French label, for grouping headers. */
export const DOSSIER_CATEGORY_LABEL: Record<DossierCategory, string> = {
  identite: 'Identité',
  ressources: 'Ressources',
  logement: 'Logement',
  famille: 'Situation familiale',
  autre: 'Autre',
};

/** Item status → French label + badge tone. */
export const DOSSIER_STATUS_META: Record<
  DossierItemStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' }
> = {
  missing: { label: 'À fournir', tone: 'neutral' },
  uploaded: { label: 'Déposé', tone: 'info' },
  validated: { label: 'Validé', tone: 'success' },
};

/**
 * A rough, explainable monthly APL estimate — mirrors the backend
 * `EstimationAideSchema`. Deliberately simplified, never the official CAF
 * barème; `avertissement` is meant to be shown, not discarded.
 */
export interface EstimationAide {
  montantEstime: number;
  loyerRetenu: number;
  chargesRetenues: number;
  participationPersonnelle: number;
  estimationPossible: boolean;
  avertissement: string;
}
