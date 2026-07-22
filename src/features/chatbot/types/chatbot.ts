import type { CaseStatus, ChatMessage, CitizenProfile } from '@/types';

/**
 * Types local to the citizen assistant.
 *
 * The conversation primitives (`ChatMessage`, `ChatRole`) stay in `@/types/chat`
 * because they already existed and are not assistant-specific. What lives here
 * is only what the *retrieval-backed* assistant adds on top: the answer envelope
 * and the context sent with a question.
 */

/**
 * Where an answer came from, as shown to the citizen.
 *
 * Deliberately says nothing about *how* the passage was found. The backend may
 * retrieve it by vector similarity, by keyword, or from a hand-written FAQ — the
 * citizen is told which document answered them, and the UI renders the same
 * thing either way.
 */
export interface ChatbotSource {
  title: string;
  category: ChatbotSourceCategory;
}

/**
 * The corpus a source belongs to. Drives the label shown next to a citation, so
 * a citizen can tell an official regulation from a practical how-to.
 */
export type ChatbotSourceCategory = 'demarche' | 'reglementation' | 'document' | 'faq';

/**
 * Everything the frontend sends alongside a question.
 *
 * All fields are optional: the assistant answers general questions without any
 * of it. When a field *is* present it lets the backend ground the answer in the
 * citizen's actual situation — "pourquoi mon dossier est en attente ?" is only
 * answerable with `caseId` and `caseStatus`.
 *
 * Nothing here is invented by the UI. A field is populated only when the value
 * is genuinely known; an absent field means "unknown", never "assume a default".
 */
export interface ChatbotContext {
  citizenProfile?: CitizenProfile;
  caseId?: string;
  caseStatus?: CaseStatus;
  /**
   * Prior turns, so a follow-up like "et pour le RIB ?" resolves. Sent by the
   * client because the backend holds no session; it is conversation *input*, not
   * conversation storage.
   */
  conversationHistory?: ChatMessage[];
}

/**
 * The complete answer envelope — the entire contract between the assistant
 * backend and this UI.
 *
 * Note what is *not* here: no model name, no confidence score, no retrieved
 * chunks, no token accounting, no prompt. Those are backend concerns. If the
 * retrieval strategy or the model behind it changes, this type does not, and no
 * component re-renders differently.
 */
export interface ChatbotResponse {
  answer: string;
  /**
   * Empty when the assistant answered without grounding — a greeting, or a
   * refusal to answer. An empty array is a meaningful state the UI renders
   * (no citations block), not an error.
   */
  sources: ChatbotSource[];
}

/**
 * A message as displayed in the assistant thread.
 *
 * Extends the shared `ChatMessage` rather than redefining it, so the existing
 * bubble rendering (suggestions, recommendation cards) keeps working unchanged
 * and only the citations are new.
 */
export interface ChatbotMessage extends ChatMessage {
  /** Present on assistant turns that were grounded in retrieved documents. */
  sources?: ChatbotSource[];
}
