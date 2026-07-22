import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AccessibilityPreferences } from '@/types';

/**
 * UI-only state. Business state belongs to its feature module — this store must
 * stay free of domain concepts.
 */
interface UiState {
  /** Mobile navigation drawer. */
  isSidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;

  /** Floating assistant panel (present on several screens). */
  isAssistantOpen: boolean;
  toggleAssistant: () => void;

  accessibility: AccessibilityPreferences;
  setAccessibilityPreference: <K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K],
  ) => void;
}

export const DEFAULT_ACCESSIBILITY: AccessibilityPreferences = {
  voiceAssistant: false,
  voiceInput: false,
  speechSynthesis: false,
  screenReaderOptimised: false,
  highContrast: false,
  largeText: false,
  keyboardNavigation: false,
  simplifiedInterface: false,
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      isSidebarOpen: false,
      openSidebar: () => set({ isSidebarOpen: true }),
      closeSidebar: () => set({ isSidebarOpen: false }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

      isAssistantOpen: false,
      toggleAssistant: () => set((state) => ({ isAssistantOpen: !state.isAssistantOpen })),

      accessibility: DEFAULT_ACCESSIBILITY,
      setAccessibilityPreference: (key, value) =>
        set((state) => ({ accessibility: { ...state.accessibility, [key]: value } })),
    }),
    {
      name: 'monparcours.ui',
      // Only the accessibility preferences deserve to survive a reload.
      partialize: (state) => ({ accessibility: state.accessibility }),
    },
  ),
);
