import { create } from 'zustand';

/**
 * Open/closed state of the floating citizen assistant, plus a one-shot "question
 * to ask on open" slot.
 *
 * UI-only, deliberately separate from `useChatbot` (which owns the conversation):
 * the launcher, the header help button and any "ask the assistant" entry point
 * all flip the same flag, while the thread itself lives on untouched. Citizen-only
 * — the agent portal has its own Assistant IA page and never mounts the launcher.
 *
 * `pendingQuestion` lets a caller elsewhere in the app (e.g. the documentation
 * mini-form) both open the panel and pre-send a question; the mounted launcher
 * consumes it exactly once via {@link consumePendingQuestion}.
 */
interface ChatbotUiState {
  isOpen: boolean;
  pendingQuestion: string | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Open the panel and queue a question for the launcher to send. */
  ask: (question: string) => void;
  /** Return the queued question (if any) and clear it. */
  consumePendingQuestion: () => string | null;
}

export const useChatbotUiStore = create<ChatbotUiState>((set, get) => ({
  isOpen: false,
  pendingQuestion: null,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  ask: (question) => set({ isOpen: true, pendingQuestion: question }),
  consumePendingQuestion: () => {
    const { pendingQuestion } = get();
    if (pendingQuestion !== null) set({ pendingQuestion: null });
    return pendingQuestion;
  },
}));
