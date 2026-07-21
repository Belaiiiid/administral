import { create } from 'zustand';

import type { AdministrationId } from '@/types';

/**
 * Session shell — deliberately inert.
 *
 * Authentication (FranceConnect / credentials) is a future full-stack module.
 * The store exposes the shape the router's <ProtectedRoute /> will consume so
 * that wiring real auth later touches this file only.
 */
export type SessionRole = 'citizen' | 'agent';

interface SessionState {
  isAuthenticated: boolean;
  role: SessionRole;
  /** `null` until the auth bootstrap resolves an identity. */
  displayName: string | null;
  activatedServices: AdministrationId[];
}

/**
 * Empty session so the shell renders without inventing a citizen.
 *
 * `isAuthenticated` stays `true` only so the protected routes remain
 * navigable while there is no auth module; every consumer must treat
 * `displayName` and `activatedServices` as genuinely absent.
 */
export const useSessionStore = create<SessionState>(() => ({
  isAuthenticated: true,
  role: 'citizen',
  displayName: null,
  activatedServices: [],
}));
