import { apiClient } from '@/services/apiClient';

/** Verdict vocabulary, kept in French — it is what the analyser and the agent portal speak. */
export type CoherenceStatus = 'coherent' | 'incoherent' | 'a_revoir';

/** One documentary check, with the reasoning behind it. */
export interface CoherenceVerification {
  /** Information family checked, e.g. `montant_loyer`. */
  champ: string;
  coherent: boolean;
  statut: CoherenceStatus;
  /** Human-readable justification, in French. */
  raison: string;
  /** 0–1. */
  confiance: number;
  fichiersConcernes: string[];
  preuves: string[];
  source: string;
}

export interface CoherenceResult {
  coherentGlobal: boolean;
  statutGlobal: CoherenceStatus;
  /** Only the checks that are not `coherent`. A clean dossier yields []. */
  incoherences: CoherenceVerification[];
}

export interface CoherenceRequest {
  profilDeclare: Record<string, unknown>;
  documentsExtraits: Record<string, unknown>[];
}

/**
 * Cross-document coherence analysis, run *before* submitting.
 *
 * The same analysis the pipeline runs server-side at submission
 * (`app/modules/ai/coherence`), exposed so a citizen can check their own
 * dossier first rather than discovering an inconsistency once an agent has it.
 *
 * Without a Mistral key configured the backend answers `a_revoir` — never
 * `coherent`. A dossier is therefore never declared consistent unverified.
 */
export const coherenceService = {
  analyser: (payload: CoherenceRequest) =>
    apiClient.post<CoherenceResult>('/ai/coherence/analyze', payload),
};
