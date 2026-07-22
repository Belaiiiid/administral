import type {
  AccessibilityPreferences,
  CitizenProfile,
  NotificationPreferences,
  SituationHistoryEntry,
} from '@/types';

export interface ProfileService {
  getProfile(): Promise<CitizenProfile>;
  updateProfile(patch: Partial<CitizenProfile>): Promise<CitizenProfile>;
  getSituationHistory(): Promise<SituationHistoryEntry[]>;
  updateAccessibility(preferences: AccessibilityPreferences): Promise<AccessibilityPreferences>;
  updateNotifications(preferences: NotificationPreferences): Promise<NotificationPreferences>;
}

const notImplemented = (method: string) => (): never => {
  throw new Error(`profileService.${method}() sera implémenté par le module full-stack Profil.`);
};

export const profileService: ProfileService = {
  getProfile: notImplemented('getProfile'),
  updateProfile: notImplemented('updateProfile'),
  getSituationHistory: notImplemented('getSituationHistory'),
  updateAccessibility: notImplemented('updateAccessibility'),
  updateNotifications: notImplemented('updateNotifications'),
};
