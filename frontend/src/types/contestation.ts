/**
 * Droit de contestation — a citizen's challenge to a decision.
 *
 * Mirrors the backend `app.modules.contestation.schemas` field for field,
 * camelCase included. Shared by the citizen surface (file + track a challenge)
 * and the agent portal (review + resolve), so the shapes live here rather than
 * in either feature.
 */

/** Fixed triage categories — the citizen's own words go in `description`. */
export type ContestationReason =
  | 'erreur_appreciation'
  | 'piece_non_prise_en_compte'
  | 'erreur_calcul'
  | 'changement_situation'
  | 'autre';

/** The small state machine a challenge moves through. */
export type ContestationStatus = 'PENDING' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED';

/** The contested dossier's decision, shown as context. */
export interface ContestedDecision {
  outcome: string;
  explanation: string;
  decidedBy: string;
  decidedAt: string;
}

/** One contestation in full — citizen read side and agent detail. */
export interface Contestation {
  id: string;
  dossierId: string;
  applicationNumber: string;
  citizenId: string;
  citizenName: string;
  originalDecisionId: string | null;
  reason: ContestationReason;
  reasonLabel: string;
  description: string;
  status: ContestationStatus;
  reviewedBy: string | null;
  resolutionComment: string | null;
  createdAt: string;
  updatedAt: string;
  decision: ContestedDecision | null;
}

/** Row projection for the agent queue. */
export interface ContestationSummary {
  id: string;
  applicationNumber: string;
  citizenName: string;
  reason: ContestationReason;
  reasonLabel: string;
  status: ContestationStatus;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The reason options a citizen picks from, with their French labels. */
export const CONTESTATION_REASONS: { value: ContestationReason; label: string }[] = [
  { value: 'erreur_appreciation', label: 'Erreur d’appréciation du dossier' },
  { value: 'piece_non_prise_en_compte', label: 'Pièce justificative non prise en compte' },
  { value: 'erreur_calcul', label: 'Erreur de calcul du droit' },
  { value: 'changement_situation', label: 'Changement de situation' },
  { value: 'autre', label: 'Autre motif' },
];

/** Status → French label + badge tone, shared by both portals. */
export const CONTESTATION_STATUS_META: Record<
  ContestationStatus,
  { label: string; tone: 'info' | 'warning' | 'success' | 'error' }
> = {
  PENDING: { label: 'En attente', tone: 'warning' },
  UNDER_REVIEW: { label: 'En cours d’examen', tone: 'info' },
  ACCEPTED: { label: 'Acceptée', tone: 'success' },
  REJECTED: { label: 'Rejetée', tone: 'error' },
};
