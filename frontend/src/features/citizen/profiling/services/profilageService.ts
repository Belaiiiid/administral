import { apiClient } from '@/services/apiClient';
import type { SessionOut, TourResponse } from '@/features/citizen/profiling/types/profilage';

export interface ProfilageService {
  creerSession(modeVocal?: boolean): Promise<SessionOut>;
  obtenirProfil(sessionId: string): Promise<SessionOut>;
  majProfil(sessionId: string, patch: Record<string, any>): Promise<SessionOut>;
  jouerTour(
    sessionId: string,
    reponse?: { champ_cible: string; valeur: string },
  ): Promise<TourResponse>;
  uploadDocument(sessionId: string, file: File): Promise<TourResponse>;
}

export const profilageService: ProfilageService = {
  creerSession: (modeVocal = false) =>
    apiClient.post<SessionOut>('/session', { mode_vocal: modeVocal }),

  obtenirProfil: (sessionId) => apiClient.get<SessionOut>(`/session/${sessionId}/profil`),

  majProfil: (sessionId, patch) => apiClient.patch<SessionOut>(`/session/${sessionId}/profil`, patch),

  jouerTour: (sessionId, reponse) =>
    apiClient.post<TourResponse>(`/session/${sessionId}/profilage/tour`, reponse ?? {}),
    
  uploadDocument: (sessionId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post<TourResponse>(`/session/${sessionId}/profilage/upload`, formData);
  }
};
