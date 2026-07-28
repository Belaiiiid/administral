/**
 * Types miroir des schémas backend (voir backend/app/schemas/{profil,agent}.py).
 * A2 — ProfilPartiel : enrichi un champ à la fois par la boucle A3.
 * A3 — TourAgent : contrat JSON strict imposé au LLM à chaque tour.
 */

export type StatutLogement = 'locataire' | 'proprietaire' | 'heberge';
export type TypeLocation =
  | 'vide'
  | 'meublee'
  | 'colocation'
  | 'chambre'
  | 'sous_location'
  | 'residence_etudiante';
export type StatutMarital = 'celibataire' | 'marie' | 'pacse' | 'concubinage';
export type StatutProfessionnel =
  | 'etudiant'
  | 'apprenti_alternant'
  | 'salarie'
  | 'demandeur_emploi'
  | 'independant';

export interface ProfilPartiel {
  prenom: string | null;
  nom: string | null;

  // Logement
  situation_logement: StatutLogement | null;
  type_location: TypeLocation | null;
  loyer_mensuel: number | null;
  surface_m2: number | null;
  code_postal: string | null;
  adresse: string | null;
  ville: string | null;
  logement_appartient_a_un_proche: boolean | null;
  logement_conventionne: boolean | null;
  moins_de_30_ans: boolean | null;
  sous_location_declaree: boolean | null;
  type_residence_detail: string | null;
  redevance_mensuelle: number | null;

  // Famille
  statut_marital: StatutMarital | null;
  a_des_enfants_a_charge: boolean | null;
  nombre_enfants_a_charge: number | null;
  nombre_adultes_rattaches: number | null;
  ages_enfants: string | null;
  percoit_pension_alimentaire: boolean | null;
  montant_pension_alimentaire: number | null;
  statut_professionnel_conjoint: StatutProfessionnel | null;
  revenus_conjoint_mensuels: number | null;

  // Statut socio-professionnel et ressources
  statut_professionnel: StatutProfessionnel | null;
  revenu_fiscal_reference: number | null;
  situation_professionnelle: string | null;
  est_boursier: boolean | null;
  montant_bourse: number | null;
  type_contrat: string | null;
  revenus_nets_mensuels: number | null;
  percoit_are: boolean | null;
  montant_are_mensuel: number | null;
  chiffre_affaires_annuel: number | null;

  derniere_maj: string | null;
}

export type ProchaineAction = 'poser_question' | 'profil_complet';
export type TypeReponse = 'texte_libre' | 'choix_multiple';

export interface TourAgent {
  prochaine_action: ProchaineAction;
  question: string | null;
  type_reponse: TypeReponse | null;
  options: string[] | null;
  champ_cible: string | null;
  regle_justifiant_la_question: string | null;
}

export interface TourResponse {
  session_id: string;
  tour: TourAgent;
  profil_partiel: ProfilPartiel;
  nombre_tours: number;
  limite_tours: number;
  profil_complet: boolean;
  source: 'llm' | 'fallback' | 'deterministe';
  analyse_reponse: AnalyseReponse | null;
}

export interface AnalyseReponse {
  type_reponse_percue: 'reponse_valide' | 'demande_clarification' | 'hors_sujet';
  valeur_extraite: string | number | boolean | null;
  message_si_clarification: string | null;
  repeter_meme_question: boolean;
}

export interface SessionOut {
  session_id: string;
  mode_vocal: boolean;
  profil_partiel: ProfilPartiel;
}
