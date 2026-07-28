import type { ProfilPartiel } from '@/features/citizen/profiling/types/profilage';

/**
 * Maps the profiling assistant's `profil_partiel` onto the profile snapshot the
 * dossier-submission endpoint expects.
 *
 * This is the link between Profiling and dossier submission: without it the
 * submitted Case carries a blank civil status and the coherence analysis has
 * nothing to compare against. The profiling vocabulary is French and the Case
 * snapshot is English, so the two enum maps below are the whole adapter — only
 * fields the citizen actually answered are emitted, leaving the rest to the
 * backend's defaults.
 */

const MARITAL_STATUS: Record<string, string> = {
  celibataire: 'single',
  marie: 'married',
  pacse: 'pacs',
  concubinage: 'cohabiting',
};

const OCCUPANCY_STATUS: Record<string, string> = {
  locataire: 'tenant',
  proprietaire: 'owner',
  heberge: 'hosted',
};

export function profilPartielToSnapshot(profil: ProfilPartiel | null): Record<string, unknown> {
  if (!profil) return {};

  const snapshot: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== '') snapshot[key] = value;
  };

  if (profil.statut_marital) set('marital_status', MARITAL_STATUS[profil.statut_marital]);
  if (profil.situation_logement) set('occupancy_status', OCCUPANCY_STATUS[profil.situation_logement]);
  set('monthly_rent_excluding_charges', round(profil.loyer_mensuel));
  set('living_area_sqm', round(profil.surface_m2));
  set('address', profil.adresse);
  set('postal_code', profil.code_postal);
  set('city', profil.ville);
  set('dependent_children', profil.nombre_enfants_a_charge);
  set('attached_adults', profil.nombre_adultes_rattaches);
  // Declared monthly net income → annual, the unit the Case snapshot stores.
  if (profil.revenus_nets_mensuels != null) {
    set('annual_income', Math.round(profil.revenus_nets_mensuels * 12));
  }

  return snapshot;
}

function round(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}
