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
  /**
   * WhatsApp click-to-chat number, digits only (E.164, no `+`) — the format
   * `wa.me` links require. This is the Meta test number while the
   * `apl-whatsapp` bot's Cloud API app is in Development mode; swap it for
   * the production business number once the app goes Live.
   */
  whatsappNumber: '15551978604',
  /** RGAA conformance level declared in the footer. */
  accessibilityStatement: 'Accessibilité : totalement conforme',
  /** Placeholder pending the real wa.me number for the WhatsApp bot channel. */
  whatsappBotUrl: 'https://wa.me/33000000000',
} as const;

export const FOOTER_LINKS = [
  { id: 'accessibility', label: APP_CONFIG.accessibilityStatement, href: '/accessibilite' },
  { id: 'legal', label: 'Mentions légales', href: '/mentions-legales' },
  { id: 'privacy', label: 'Données personnelles', href: '/donnees-personnelles' },
  { id: 'cookies', label: 'Gestion des cookies', href: '/cookies' },
] as const;
