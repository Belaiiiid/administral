import { create } from 'zustand';

import { ApiClientError } from '@/services/apiClient';
import { profilageService } from '@/features/citizen/profiling/services/profilageService';
import {
  citizenProfileService,
  profilingAnswersToPayload,
} from '@/features/citizen/profiling/services/citizenProfileService';
import type { ProfilPartiel, TourAgent } from '@/features/citizen/profiling/types/profilage';

/**
 * Persist the profiling answers to the citizen's profile, best-effort.
 *
 * The profiling turn endpoint is session-based and keeps answers only in an
 * in-memory session (30-min TTL); nothing reached the database until the citizen
 * pressed "Enregistrer" on the profile page — so the personalised dossier stayed
 * stale as they talked to the assistant. Persisting after each valid turn lets
 * the backend regenerate the checklist live (`_resync_dossier`). Swallowed on
 * failure: an anonymous or expired session simply keeps its session-only answers,
 * exactly as before — this never surfaces an error in the assistant.
 */
function persistProfilAnswers(profil: ProfilPartiel | null): void {
  const payload = profilingAnswersToPayload(profil);
  if (Object.keys(payload).length === 0) return;
  void citizenProfileService.mettreAJour(payload).catch(() => undefined);
}

export interface HistoriqueEntry {
  question: string;
  reponse: string;
}

interface ProfilageState {
  sessionId: string | null;
  questionActuelle: TourAgent | null;
  profilPartiel: ProfilPartiel | null;
  historique: HistoriqueEntry[];
  nombreTours: number;
  limiteTours: number;
  profilComplet: boolean;
  isLoading: boolean;
  erreur: string | null;
  /** Overlay visible ? */
  estOuvert: boolean;
  /** Dernier champ qui vient d'être rempli — pour surligner dans le formulaire. */
  dernierChampRempli: string | null;
  /** Source réelle de la dernière réponse : "llm" (Mistral), "fallback" (règles), "deterministe" (harness). */
  derniereSource: 'llm' | 'fallback' | 'deterministe' | null;
  /** Message humain à afficher après une clarification ou une réponse hors sujet. */
  messageAssistant: string | null;

  demarrer: () => Promise<void>;
  initFromUpload: (sessionId: string, tourResponse: any) => void;
  repondre: (valeur: string) => Promise<void>;
  ouvrir: () => void;
  fermer: () => void;
  basculer: () => void;
  reinitialiser: () => void;
}

function messageErreurDepuis(err: unknown): string {
  if (err instanceof ApiClientError) return err.payload.message;
  return err instanceof Error ? err.message : 'Erreur inconnue.';
}

export const useProfilageStore = create<ProfilageState>((set, get) => ({
  sessionId: null,
  questionActuelle: null,
  profilPartiel: null,
  historique: [],
  nombreTours: 0,
  limiteTours: 12,
  profilComplet: false,
  isLoading: false,
  erreur: null,
  estOuvert: true,
  dernierChampRempli: null,
  derniereSource: null,
  messageAssistant: null,

  demarrer: async () => {
    if (get().sessionId || get().isLoading) return;
    set({ isLoading: true, erreur: null });
    try {
      const session = await profilageService.creerSession(false);
      
      // Inject user identity if authenticated, to skip Identity questions
      const { useSessionStore } = await import('@/store/sessionStore');
      const currentUser = useSessionStore.getState().user;
      if (currentUser) {
        await profilageService.majProfil(session.session_id, {
          prenom: currentUser.firstName,
          nom: currentUser.lastName,
          email: currentUser.email,
        });
      }

      const premierTour = await profilageService.jouerTour(session.session_id);

      set({
        sessionId: session.session_id,
        profilPartiel: premierTour.profil_partiel,
        nombreTours: premierTour.nombre_tours,
        limiteTours: premierTour.limite_tours,
        profilComplet: premierTour.profil_complet,
        questionActuelle: premierTour.tour,
        derniereSource: premierTour.source,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false, erreur: messageErreurDepuis(err) });
    }
  },

  initFromUpload: (sessionId: string, tourResponse: any) => {
    set({
      sessionId,
      profilPartiel: tourResponse.profil_partiel,
      nombreTours: tourResponse.nombre_tours,
      limiteTours: tourResponse.limite_tours,
      profilComplet: tourResponse.profil_complet,
      questionActuelle: tourResponse.tour,
      derniereSource: tourResponse.source,
      isLoading: false,
      erreur: null,
    });
  },

  repondre: async (valeur: string) => {
    const { sessionId, questionActuelle, isLoading, profilComplet } = get();
    if (!sessionId || isLoading || profilComplet || !questionActuelle?.champ_cible || !valeur.trim()) {
      return;
    }

    const champRempli = questionActuelle.champ_cible;
    set({ isLoading: true, erreur: null });
    try {
      const tourResponse = await profilageService.jouerTour(sessionId, {
        champ_cible: champRempli,
        valeur,
      });

      const analyse = tourResponse.analyse_reponse;
      const reponseValide = analyse?.type_reponse_percue !== 'demande_clarification' &&
        analyse?.type_reponse_percue !== 'hors_sujet';

      set((state) => ({
        profilPartiel: tourResponse.profil_partiel,
        nombreTours: tourResponse.nombre_tours,
        limiteTours: tourResponse.limite_tours,
        profilComplet: tourResponse.profil_complet,
        questionActuelle: tourResponse.tour,
        dernierChampRempli: reponseValide ? champRempli : null,
        derniereSource: tourResponse.source,
        messageAssistant: analyse?.type_reponse_percue === 'demande_clarification'
          ? analyse.message_si_clarification
          : analyse?.type_reponse_percue === 'hors_sujet'
            ? 'Je n’ai pas compris votre réponse. Répondez simplement à la question ci-dessous.'
            : null,
        historique: reponseValide
          ? [...state.historique, { question: questionActuelle.question ?? '', reponse: valeur }]
          : state.historique,
        isLoading: false,
      }));

      // Réponse valide → on persiste le profil pour que la checklist du dossier
      // se régénère côté serveur (best-effort ; sans session citoyen, no-op).
      if (reponseValide) {
        persistProfilAnswers(tourResponse.profil_partiel);
      }

      // Le highlight du champ nouvellement rempli s'estompe après 1,5s.
      setTimeout(() => {
        if (get().dernierChampRempli === champRempli) {
          set({ dernierChampRempli: null });
        }
      }, 1500);
    } catch (err) {
      set({ isLoading: false, erreur: messageErreurDepuis(err) });
    }
  },

  ouvrir: () => set({ estOuvert: true }),
  fermer: () => set({ estOuvert: false }),
  basculer: () => set((state) => ({ estOuvert: !state.estOuvert })),

  reinitialiser: () =>
    set({
      sessionId: null,
      questionActuelle: null,
      profilPartiel: null,
      historique: [],
      nombreTours: 0,
      limiteTours: 12,
      profilComplet: false,
      isLoading: false,
      erreur: null,
      dernierChampRempli: null,
      derniereSource: null,
      messageAssistant: null,
    }),
}));
