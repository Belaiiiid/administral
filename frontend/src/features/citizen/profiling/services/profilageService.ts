import { apiClient } from '@/services/apiClient';
import type { SessionOut, TourResponse } from '@/features/citizen/profiling/types/profilage';

export interface ProfilageService {
  creerSession(modeVocal?: boolean): Promise<SessionOut>;
  obtenirProfil(sessionId: string): Promise<SessionOut>;
  jouerTour(
    sessionId: string,
    reponse?: { champ_cible: string; valeur: string },
  ): Promise<TourResponse>;
}

export const profilageService: ProfilageService = {
  creerSession: (modeVocal = false) =>
    apiClient.post<SessionOut>('/session', { mode_vocal: modeVocal }),

  obtenirProfil: (sessionId) => apiClient.get<SessionOut>(`/session/${sessionId}/profil`),

  jouerTour: (sessionId, reponse) =>
    apiClient.post<TourResponse>(`/session/${sessionId}/profilage/tour`, reponse ?? {}),
};
