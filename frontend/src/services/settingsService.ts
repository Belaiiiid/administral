import type { UserSettings, UserSettingsUpdate } from '@/types';
import { apiClient } from './apiClient';

/**
 * Settings API — shared by both portals.
 *
 * One real endpoint set (`/settings`), scoped to the authenticated user. A
 * citizen and an agent call the same methods and each read and write only their
 * own row; the server does the scoping.
 */
export interface SettingsService {
  get(): Promise<UserSettings>;
  update(patch: UserSettingsUpdate): Promise<UserSettings>;
}

export const settingsService: SettingsService = {
  get: () => apiClient.get<UserSettings>('/settings'),
  update: (patch) => apiClient.patch<UserSettings>('/settings', patch),
};
