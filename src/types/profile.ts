import type { AdministrationId, ProcessStatus } from './common';

export interface CitizenIdentity {
  id: string;
  firstName: string;
  lastName: string;
  /** NIR — displayed masked in the UI. */
  socialSecurityNumber: string;
  birthDate: string;
  birthPlace: string;
  email: string;
  avatarUrl: string | null;
  verified: boolean;
}

export interface HouseholdComposition {
  maritalStatus: 'single' | 'married' | 'pacs' | 'cohabiting';
  dependentChildren: number;
  attachedAdults: number;
}

export interface HousingDetails {
  occupancyStatus: 'tenant' | 'owner' | 'hosted';
  livingAreaSqm: number;
  monthlyRentExcludingCharges: number;
  address: string;
  postalCode: string;
  city: string;
}

/** Runtime accessibility preferences — mirrored into the UI store. */
export interface AccessibilityPreferences {
  voiceAssistant: boolean;
  voiceInput: boolean;
  /** Automatic read-aloud of on-screen text by a system voice. */
  speechSynthesis: boolean;
  /** Markup optimisations targeting NVDA / JAWS / VoiceOver. */
  screenReaderOptimised: boolean;
  highContrast: boolean;
  largeText: boolean;
  keyboardNavigation: boolean;
  simplifiedInterface: boolean;
}

export interface NotificationPreferences {
  email: boolean;
  aiAssistance: boolean;
  crossAdministrationSharing: boolean;
}

export interface SituationHistoryEntry {
  id: string;
  date: string;
  changeType: string;
  status: ProcessStatus;
}

export interface CitizenProfile {
  identity: CitizenIdentity;
  household: HouseholdComposition;
  housing: HousingDetails;
  accessibility: AccessibilityPreferences;
  notifications: NotificationPreferences;
  /** Service modules the citizen has activated. */
  activatedServices: AdministrationId[];
  completionRate: number;
}
