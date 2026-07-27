import type { PersonalizedDossier } from '@/types';
import { apiClient } from './apiClient';

/**
 * The personalised dossier — the profile-driven checklist and its uploads.
 *
 * `getDossier` returns the checklist derived from the citizen's profile (the
 * backend regenerates it on read, idempotently). `upload` reuses the existing
 * citizen document endpoint, targeting *this* dossier's application so a piece
 * lands against the personalised checklist and flips the matching item.
 */
export interface DossierService {
  /** The citizen's personalised dossier. `GET /citizen/dossier`. */
  getDossier(): Promise<PersonalizedDossier>;
  /** Upload one document to the personalised dossier's application. */
  upload(applicationId: string, file: File): Promise<void>;
}

export const dossierService: DossierService = {
  getDossier: () => apiClient.get<PersonalizedDossier>('/citizen/dossier'),

  upload: (applicationId, file) => {
    // Same multipart endpoint the document upload page uses; FormData sets its
    // own Content-Type, so apiClient must not force JSON.
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<void>('/documents', form, {
      params: { applicationId },
    });
  },
};
