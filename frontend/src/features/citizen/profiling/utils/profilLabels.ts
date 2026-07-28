import type {
  ProfilPartiel,
  StatutLogement,
  StatutMarital,
  StatutProfessionnel,
  TypeLocation,
} from '@/features/citizen/profiling/types/profilage';

const LABELS_STATUT_LOGEMENT: Record<StatutLogement, string> = {
  locataire: 'Locataire',
  proprietaire: 'Propriétaire',
  heberge: 'Hébergé(e) à titre gratuit',
};

const LABELS_TYPE_LOCATION: Record<TypeLocation, string> = {
  vide: 'Location vide (non meublée)',
  meublee: 'Location meublée',
  chambre: 'Chambre',
  colocation: 'Colocation',
  sous_location: 'Sous-location',
  residence_etudiante: 'Foyer / Résidence (CROUS, EHPAD...)',
};

const LABELS_STATUT_MARITAL: Record<StatutMarital, string> = {
  celibataire: 'Célibataire',
  marie: 'Marié(e)',
  pacse: 'Pacsé(e)',
  concubinage: 'En concubinage',
};

const LABELS_STATUT_PROFESSIONNEL: Record<StatutProfessionnel, string> = {
  etudiant: 'Étudiant(e)',
  apprenti_alternant: 'Apprenti(e) / Alternant(e)',
  salarie: 'Salarié(e)',
  demandeur_emploi: "Demandeur d'emploi",
  independant: 'Indépendant(e)',
};

export function libelleStatutLogement(v: ProfilPartiel['situation_logement']): string | undefined {
  return v ? LABELS_STATUT_LOGEMENT[v] : undefined;
}

export function libelleTypeLocation(v: ProfilPartiel['type_location']): string | undefined {
  return v ? LABELS_TYPE_LOCATION[v] : undefined;
}

export function libelleStatutMarital(v: ProfilPartiel['statut_marital']): string | undefined {
  return v ? LABELS_STATUT_MARITAL[v] : undefined;
}

export function libelleStatutProfessionnel(
  v: ProfilPartiel['statut_professionnel'],
): string | undefined {
  return v ? LABELS_STATUT_PROFESSIONNEL[v] : undefined;
}

export function libelleOuiNon(v: boolean | null): string | undefined {
  if (v === null || v === undefined) return undefined;
  return v ? 'Oui' : 'Non';
}

export function libelleMontant(v: number | null): string | undefined {
  if (v === null || v === undefined) return undefined;
  return `${v.toLocaleString('fr-FR')} €`;
}

export function libelleSurface(v: number | null): string | undefined {
  if (v === null || v === undefined) return undefined;
  return `${v.toLocaleString('fr-FR')} m²`;
}

export function libelleTexte(v: string | null): string | undefined {
  return v ?? undefined;
}
