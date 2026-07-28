/**
 * Per-account settings, as served by `GET /api/settings`. One row per user,
 * shared endpoint for both portals; the columns span both roles and the UI
 * shows each role the ones it may change.
 */
export interface UserSettings {
  /** Receive an e-mail copy of notifications, not just the in-app entry. */
  emailNotifications: boolean;
  /** Citizen: show the AI assistant (profiling / chatbot). */
  aiAssistance: boolean;
  /** Citizen: consent to sharing declared data across administrations. */
  crossAdministrationSharing: boolean;
}

/** A partial edit — only the keys sent are changed. */
export type UserSettingsUpdate = Partial<UserSettings>;
