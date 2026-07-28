import { apiClient } from '@/services/apiClient';
import type { ProfilPartiel } from '@/features/citizen/profiling/types/profilage';

/**
 * The citizen's persisted profile — the write path the profiling assistant never
 * had. Mirrors `backend/app/modules/citizen/profile.py`.
 *
 * Wire shape note: the wrapper is camelCase (`birthDate`, `hasSocialSecurityNumber`)
 * because `CitizenProfileResponse` uses the `to_camel` alias generator, but the
 * nested `profile` keeps the profiling schema's snake_case field names — it *is*
 * a `ProfilPartiel`, serialised as-is. Omitted keys are absent, not null
 * (`exclude_none`), hence `Partial`.
 */
export interface CitizenProfilePersisted {
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string | null;
  /** Masked NIR for display, e.g. `2 91 04 •• ••• ••• ••`. Null when unset. */
  socialSecurityNumberMasked: string | null;
  hasSocialSecurityNumber: boolean;
  profile: Partial<ProfilPartiel>;
  profileUpdatedAt: string | null;
}

/**
 * A partial edit. Every field is optional — a `PATCH`. Omitting a key leaves the
 * stored value untouched; the backend distinguishes "absent" from "null".
 */
export interface CitizenProfileUpdatePayload {
  firstName?: string;
  lastName?: string;
  birthDate?: string | null;
  /** Digits only (13 or 15). The backend strips spacing; send it either way. */
  socialSecurityNumber?: string | null;
  /** Profiling answers to merge, snake_case. Omitted keys are left untouched. */
  profile?: Partial<ProfilPartiel>;
}

export interface CitizenProfileService {
  /** The persisted profile for the authenticated citizen. */
  obtenir(): Promise<CitizenProfilePersisted>;
  /** Persist a partial edit and return the updated profile. */
  mettreAJour(payload: CitizenProfileUpdatePayload): Promise<CitizenProfilePersisted>;
}

export const citizenProfileService: CitizenProfileService = {
  obtenir: () => apiClient.get<CitizenProfilePersisted>('/citizen/profile'),
  mettreAJour: (payload) =>
    apiClient.patch<CitizenProfilePersisted>('/citizen/profile', payload),
};

/**
 * Turn the profiling assistant's answers into a profile-update payload.
 *
 * `nom`/`prenom` are lifted onto the civil-status identity (`firstName` /
 * `lastName`) because the assistant collects them as ordinary profile fields but
 * they are identity everywhere else; `derniere_maj` is a session artefact and is
 * dropped. Null/undefined answers are stripped so an unanswered field never
 * overwrites a stored value with a blank. Returns `{}` when there is nothing to
 * save, so a caller can skip the request.
 */
export function profilingAnswersToPayload(
  profil: Partial<ProfilPartiel> | null | undefined,
): CitizenProfileUpdatePayload {
  const answers = Object.fromEntries(
    Object.entries(profil ?? {}).filter(([, v]) => v !== null && v !== undefined),
  ) as Partial<ProfilPartiel>;

  const { nom, prenom, derniere_maj: _ignored, ...profileFields } = answers;
  const payload: CitizenProfileUpdatePayload = {};

  if (prenom) payload.firstName = prenom;
  if (nom) payload.lastName = nom;
  if (Object.keys(profileFields).length > 0) payload.profile = profileFields;

  return payload;
}
