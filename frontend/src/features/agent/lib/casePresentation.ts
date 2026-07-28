import type { AlertProps } from '@/components/ui/alert';
import type {
  CaseCitizen,
  CaseScoreBand,
  CaseStatus,
  CoherenceAnomaly,
  DocumentAnalysisStatus,
  ReportOutcome,
} from '@/types';
import type { ProcessStatus, StatusTone } from '@/types';

/** The tone vocabulary <Alert /> accepts — narrower than `StatusTone`. */
type AlertTone = NonNullable<AlertProps['tone']>;

/**
 * Domain vocabulary → design-system vocabulary.
 *
 * These are *lookup tables, not business rules*: nothing here decides anything
 * about a case, it only decides how an already-decided value is spelled and
 * coloured. Keeping them out of the pages means no agent component contains a
 * status conditional, and a new `CaseStatus` fails the build here — in one
 * exhaustive `Record` — instead of silently rendering blank in three views.
 */

/**
 * `CaseStatus` is richer than the citizen-facing `ProcessStatus` that
 * <StatusBadge /> consumes, so each agent status collapses onto the closest
 * citizen equivalent for iconography, while `CASE_STATUS_LABEL` supplies the
 * precise agent wording via the badge's `label` override.
 */
export const CASE_STATUS_BADGE: Record<CaseStatus, ProcessStatus> = {
  submitted: 'pending',
  awaiting_documents: 'pending',
  under_review: 'in_progress',
  ready_for_decision: 'in_progress',
  validated: 'validated',
  rejected: 'rejected',
};

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  submitted: 'Déposé',
  awaiting_documents: 'Pièces manquantes',
  under_review: 'En cours d’instruction',
  ready_for_decision: 'Prêt à décider',
  validated: 'Validé',
  rejected: 'Rejeté',
};

/** Colour of the score pill. The *band* is decided by the backend, not here. */
export const SCORE_BAND_TONE: Record<CaseScoreBand, StatusTone> = {
  high: 'success',
  medium: 'warning',
  low: 'error',
};

export const SCORE_BAND_LABEL: Record<CaseScoreBand, string> = {
  high: 'Favorable',
  medium: 'À examiner',
  low: 'Défavorable',
};

export const REPORT_OUTCOME_TONE: Record<ReportOutcome, StatusTone> = {
  passed: 'success',
  warning: 'warning',
  failed: 'error',
};

export const REPORT_OUTCOME_LABEL: Record<ReportOutcome, string> = {
  passed: 'Conforme',
  warning: 'Réserves',
  failed: 'Non conforme',
};

/**
 * Anomaly severity → <Alert /> tone.
 *
 * Typed against the alert's own union, not `StatusTone`: <Alert /> accepts
 * `ai` and rejects `neutral`, so the two vocabularies are not interchangeable
 * and widening this to `StatusTone` would only fail at the call site.
 */
export const ANOMALY_TONE: Record<CoherenceAnomaly['severity'], AlertTone> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
};

/** « Camille Dupont-Test ». Display concern, hence not stored on the model. */
export const citizenFullName = (citizen: CaseCitizen): string =>
  `${citizen.firstName} ${citizen.lastName}`;

export const HOUSEHOLD_STATUS_LABEL: Record<string, string> = {
  single: 'Célibataire',
  married: 'Marié·e',
  pacs: 'Pacsé·e',
  cohabiting: 'En concubinage',
};

export const OCCUPANCY_STATUS_LABEL: Record<string, string> = {
  tenant: 'Locataire',
  owner: 'Propriétaire',
  hosted: 'Hébergé·e',
};

export const DOCUMENT_STATUS_TONE: Record<DocumentAnalysisStatus, StatusTone> = {
  uploading: 'neutral',
  analysing: 'info',
  validated: 'success',
  rejected: 'error',
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentAnalysisStatus, string> = {
  uploading: 'Téléversement',
  analysing: 'Analyse en cours',
  validated: 'Validé',
  rejected: 'Rejeté',
};

/**
 * Badge tone for a C4 fraud-risk level.
 *
 * A record keyed by the *known* levels, with a fallback in the accessor below —
 * the level is a free string on the wire (the model could return anything), and
 * an unmapped value must degrade to neutral rather than crash a lookup.
 */
const FRAUD_RISK_TONE: Record<string, StatusTone> = {
  FAIBLE: 'success',
  'À VÉRIFIER': 'warning',
  MODÉRÉ: 'warning',
  ÉLEVÉ: 'error',
  CRITIQUE: 'error',
  INCONNU: 'neutral',
};

export const fraudRiskTone = (risk: string): StatusTone => FRAUD_RISK_TONE[risk] ?? 'neutral';

/** « 482 Ko ». Binary-agnostic on purpose — agents read size, not storage. */
export const formatFileSize = (bytes: number): string =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} Mo`
    : `${Math.max(1, Math.round(bytes / 1000))} Ko`;
