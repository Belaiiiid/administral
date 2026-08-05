/**
 * Single source of truth for route paths. Never hardcode a URL in a component —
 * import from here so a route rename is a one-line change.
 */
export const ROUTES = {
  home: '/',

  // Public / authentication shell
  login: '/login',
  register: '/register',
  // Redeem links emailed by the backend. Public: the token is the credential,
  // and these are opened from a mail client with no session. The paths are
  // mirrored in backend/app/modules/auth/notifications.py — keep them in sync.
  forgotPassword: '/mot-de-passe-oublie',
  resetPassword: '/reinitialiser-mot-de-passe',
  verifyEmail: '/verifier-email',
  // Signup-first profiling: where a new citizen lands right after registration.
  onboardingProfilage: '/onboarding/profilage',

  // Citizen portal
  // List of administrations (CAF, France Travail, …) — reached right after
  // voice onboarding, before any one of them is chosen. Public: browsing this
  // list and the CAF services hub behind it requires no account; only opening
  // an actual service (APL à l'Aide) checks authentication.
  administrations: '/administrations',
  portal: '/portal',
  portalNotifications: '/portal/notifications',

  // Cross-cutting citizen modules
  profile: '/profile',
  profileAccessibility: '/profile/accessibilite',
  settings: '/parametres',
  // "Envoyer un dossier" — checklist, dépôt de pièces, estimation, soumission.
  dossier: '/mon-dossier',
  // "Suivre un dossier déposé" — où en est l'instruction du dossier déjà envoyé.
  suivi: '/mon-dossier/suivi',
  // France Travail — accompagnement emploi, pas un dossier administratif.
  franceTravail: '/france-travail',
  franceTravailCvCoach: '/france-travail/cv-coach',
  franceTravailJobSearch: '/france-travail/recherche',
  documents: '/documents',
  documentsUpload: '/documents/depot',
  chat: '/chat',

  // Back-office
  agent: '/agent',

  // Administration (admin only)
  admin: '/admin',

  notFound: '*',
} as const;
