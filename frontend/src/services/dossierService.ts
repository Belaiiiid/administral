import type { CitizenDocument, EstimationAide, PersonalizedDossier } from '@/types';
import { apiClient } from './apiClient';
import type { DossierReview, SubmitDossierResult } from './documentService';

/**
 * The personalised dossier — the profile-driven checklist, its uploads, and its
 * submission to the administration.
 *
 * This is the single citizen dossier surface. `getDossier` returns the checklist
 * derived from the citizen's profile (the backend regenerates it on read,
 * idempotently). `upload` targets *this* dossier's application so a piece lands
 * against the personalised checklist. `submit` / `getReview` reuse the existing
 * citizen → agent bridge, keyed on the citizen's own application id — not the
 * legacy fixed demo dossier — so the whole flow is profile-driven end to end.
 */
export interface DossierService {
  /** The citizen's personalised dossier. `GET /citizen/dossier`. */
  getDossier(): Promise<PersonalizedDossier>;
  /** Documents already deposited against this application, in upload order. */
  listDocuments(applicationId: string): Promise<CitizenDocument[]>;
  /** Upload one document to the personalised dossier's application. Returns
   *  the stored document, extraction and classification result. */
  upload(applicationId: string, file: File): Promise<CitizenDocument>;
  /** Submit the dossier — emits an agent Case from the citizen Application. */
  submit(applicationId: string, profile?: Record<string, unknown>): Promise<SubmitDossierResult>;
  /** Where the submitted dossier stands in agent review (status + decision). */
  getReview(applicationId: string): Promise<DossierReview>;
  /** Rough, indicative monthly amount from the profile declared so far. */
  getEstimation(): Promise<EstimationAide>;
}

export const dossierService: DossierService = {
  getDossier: () => apiClient.get<PersonalizedDossier>('/citizen/dossier'),

  listDocuments: (applicationId) =>
    apiClient.get<CitizenDocument[]>('/documents', { params: { applicationId } }),

  upload: (applicationId, file) => {
    // Same multipart endpoint the document upload page uses; FormData sets its
    // own Content-Type, so apiClient must not force JSON.
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<CitizenDocument>('/documents', form, {
      params: { applicationId },
    });
  },

  submit: (applicationId, profile) =>
    apiClient.post<SubmitDossierResult>(
      `/applications/${encodeURIComponent(applicationId)}/submit`,
      { service_id: 'caf', profile: profile ?? {} },
    ),

  getReview: (applicationId) =>
    apiClient.get<DossierReview>(`/applications/${encodeURIComponent(applicationId)}/review`),

  getEstimation: () => apiClient.get<EstimationAide>('/citizen/estimation'),
};
