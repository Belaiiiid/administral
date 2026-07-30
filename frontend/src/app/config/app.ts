/**
 * Platform-level identity. The portal brand ("Ad'Ministral") is distinct from
 * the service modules it hosts ("APL à l'Aide", …) — see docs/design-analysis.md §0.
 */
export const APP_CONFIG = {
  name: "Ad'Ministral",
  tagline: 'Un compte, un profil, tous vos services publics',
  administration: 'République Française',
  legalEntity: 'Direction de l’information légale et administrative',
  supportPhone: '3919',
  /** RGAA conformance level declared in the footer. */
  accessibilityStatement: 'Accessibilité : totalement conforme',
} as const;

export const FOOTER_LINKS = [
  { id: 'accessibility', label: APP_CONFIG.accessibilityStatement, href: '/accessibilite' },
  { id: 'legal', label: 'Mentions légales', href: '/mentions-legales' },
  { id: 'privacy', label: 'Données personnelles', href: '/donnees-personnelles' },
  { id: 'cookies', label: 'Gestion des cookies', href: '/cookies' },
] as const;
