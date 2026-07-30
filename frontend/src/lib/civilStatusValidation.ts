/**
 * Client-side mirror of the backend's civil-status validation
 * (`app.core.security.social_security_number_error`, `CitizenProfileUpdate`
 * in `app/modules/citizen/profile.py`).
 *
 * Duplicated deliberately, not shared via codegen: the backend remains the
 * authority (it re-validates on every `PATCH /citizen/profile` regardless of
 * what this module says), but a citizen mistyping a NIR or a birth date
 * deserves to see *why* immediately, not a generic "requête invalide" after a
 * round-trip. Keep the two in sync by hand if either rule changes.
 */

/**
 * Validate a NIR's shape and, when given in full, its official check key.
 *
 * Returns a French, user-facing message describing what is wrong, or `null`
 * when the value is acceptable. See the backend counterpart for the exact
 * rules and their deliberate limits (sex digit 1/2 only, month 01-12 only,
 * no department/commune check, no Corsican letter substitution).
 */
export function socialSecurityNumberError(value: string): string | null {
  const digits = value.replace(/\D/g, '');

  if (digits.length !== 13 && digits.length !== 15) {
    return 'Le numéro de sécurité sociale doit comporter 13 chiffres (15 avec la clé).';
  }

  if (digits[0] !== '1' && digits[0] !== '2') {
    return 'Le numéro de sécurité sociale doit commencer par 1 (homme) ou 2 (femme).';
  }

  const mois = Number(digits.slice(3, 5));
  if (!(mois >= 1 && mois <= 12)) {
    return 'Le mois de naissance (5e et 6e chiffres) doit être compris entre 01 et 12.';
  }

  if (digits.length === 15) {
    const numero = digits.slice(0, 13);
    const cle = Number(digits.slice(13));
    // `numero` easily exceeds Number.MAX_SAFE_INTEGER's comfortable range for
    // exact arithmetic once multiplied — BigInt keeps the modulo exact.
    const cleAttendue = 97 - Number(BigInt(numero) % 97n);
    if (cle !== cleAttendue) {
      return 'La clé de contrôle (2 derniers chiffres) ne correspond pas au numéro.';
    }
  }

  return null;
}

/**
 * Validate a birth date (`YYYY-MM-DD`, as produced by `<input type="date">`).
 *
 * Returns a French, user-facing message, or `null` when acceptable. An empty
 * string is treated as "not provided" — not an error — the same way the
 * backend leaves an omitted field untouched.
 */
export function birthDateError(value: string): string | null {
  if (!value) return null;

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date de naissance invalide.';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed > today) {
    return 'La date de naissance ne peut pas être dans le futur.';
  }

  if (parsed.getFullYear() < 1900) {
    return 'La date de naissance n’est pas plausible.';
  }

  return null;
}
