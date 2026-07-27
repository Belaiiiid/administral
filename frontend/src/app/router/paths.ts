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
  onboardingServices: '/onboarding/services',
  onboardingAccessibility: '/onboarding/accessibilite',
  // Signup-first profiling: where a new citizen lands right after registration.
  onboardingProfilage: '/onboarding/profilage',

  // Citizen portal
  portal: '/portal',
  portalServices: '/portal/services',
  portalNotifications: '/portal/notifications',

  // APL service module
  apl: '/apl',
  aplSimulator: '/apl/simulateur',
  aplApplication: '/apl/demande',
  aplApplicationDetail: (id = ':applicationId') => `/apl/demande/${id}`,

  // Cross-cutting citizen modules
  profile: '/profile',
  profileAccessibility: '/profile/accessibilite',
  settings: '/parametres',
  dossier: '/mon-dossier',
  documents: '/documents',
  documentsUpload: '/documents/depot',
  chat: '/chat',

  // Back-office
  agent: '/agent',

  notFound: '*',
} as const;
