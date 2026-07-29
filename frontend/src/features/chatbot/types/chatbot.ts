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
export type ChatbotSourceCategory =
  | 'demarche'
  | 'reglementation'
  | 'document'
  | 'faq'
  /** Corpus juridique, réservé au rôle agent côté backend. */
  | 'legislation';

/**
 * La question de clarification à laquelle le prochain message répond.
 *
 * Émise par le backend avec la question, renvoyée telle quelle avec la réponse.
 * Le backend ne garde aucune session : cet état fait l'aller-retour par le
 * client, exactement comme `conversationHistory`.
 */
export interface ChatbotPendingClarification {
  originalQuestion: string;
  intent: 'rag_general' | 'documents_necessaires';
}

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
  /** La clarification en attente, telle que reçue au tour précédent. */
  pendingClarification?: ChatbotPendingClarification;
  /**
   * `true` seulement quand le message répond à la clarification (clic sur une
   * option, ou saisie alors qu'une question à réponse libre est posée). Le
   * backend s'y fie pour court-circuiter sa classification d'intention : c'est
   * l'UI qui sait d'où vient la réponse, il ne le devine jamais du texte.
   */
  isClarificationReply?: boolean;
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
  /**
   * Choix proposés quand la réponse est une question de clarification. `null`
   * (ou absent) = réponse finale, ou question attendant une valeur libre.
   * Les deux derniers choix sont toujours « Je ne comprends pas, expliquez-moi »
   * et « Passer cette question » : le backend les garantit.
   */
  options?: string[] | null;
  /** Non nul tant que l'assistant attend une réponse à sa question. */
  pendingClarification?: ChatbotPendingClarification | null;
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
  /**
   * Présent sur les tours où l'assistant pose une question à choix. Distinct de
   * `suggestions` (relances libres) : répondre par un de ces choix est routé
   * comme une réponse de clarification, pas comme un nouveau message.
   */
  options?: string[];
}

/**
 * One turn as persisted server-side (`GET /citizen/chatbot/history`).
 *
 * Only for a signed-in citizen — an anonymous visitor has nothing to fetch,
 * since nothing was ever stored for them. Deliberately narrower than
 * `ChatbotMessage`: `options`/clarification state is never persisted, so a
 * restored thread never carries a stale choice popup.
 */
export interface ChatHistoryMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatbotSource[] | null;
  createdAt: string;
}
