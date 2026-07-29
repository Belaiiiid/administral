import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface VoiceState {
  modeVocal: boolean;
  hasSeenVoiceOnboarding: boolean;
  enableVoiceMode: () => void;
  disableVoiceMode: () => void;
  setHasSeenVoiceOnboarding: (value: boolean) => void;
  resetVoiceMode: () => void;
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set) => ({
      modeVocal: false,
      hasSeenVoiceOnboarding: false,
      enableVoiceMode: () => set({ modeVocal: true }),
      disableVoiceMode: () => set({ modeVocal: false }),
      setHasSeenVoiceOnboarding: (hasSeenVoiceOnboarding) => set({ hasSeenVoiceOnboarding }),
      resetVoiceMode: () => set({ modeVocal: false, hasSeenVoiceOnboarding: false }),
    }),
    {
      name: 'monparcours.voice',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
