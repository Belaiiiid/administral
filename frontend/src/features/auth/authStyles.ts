/**
 * Style partagé des champs des écrans d'entrée (connexion, inscription).
 *
 * `ring-0` neutralise l'anneau de 2px que `Input` pose par défaut : le focus est
 * ici un liseré navy plus une ombre douce de 3px, pas les deux à la fois. Les
 * teintes viennent de `.login-scope` (src/index.css), posé par `AuthLayout`.
 */
export const AUTH_FIELD = [
  'h-12 rounded-xl border-[var(--login-border)] bg-[var(--login-field)] text-body-md',
  'focus-visible:border-[var(--login-navy)] focus-visible:ring-0',
  'focus-visible:shadow-[var(--login-focus-ring)]',
].join(' ');

/**
 * Case à cocher sur mesure : 18px, coins à 5px, coche blanche sur navy.
 * La coche par défaut fait 14px et débordait visuellement d'une case
 * rétrécie — d'où le `[&_svg]:size-3`.
 */
export const AUTH_CHECKBOX = [
  'size-[18px] rounded-[5px] border-[var(--login-check-border)] bg-surface-lowest',
  'data-[state=checked]:border-[var(--login-navy)] data-[state=checked]:bg-[var(--login-navy)]',
  'data-[state=checked]:text-white [&_svg]:size-3',
].join(' ');
