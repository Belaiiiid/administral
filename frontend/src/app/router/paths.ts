/**
 * Single source of truth for route paths. Never hardcode a URL in a component —
 * import from here so a route rename is a one-line change.
 */
export const ROUTES = {
  home: '/',

  // Public / authentication shell (no auth logic yet)
  login: '/login',
  register: '/register',
  onboardingServices: '/onboarding/services',
  onboardingAccessibility: '/onboarding/accessibilite',

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
  documents: '/documents',
  documentsUpload: '/documents/depot',
  chat: '/chat',

  // Back-office
  agent: '/agent',

  notFound: '*',
} as const;
