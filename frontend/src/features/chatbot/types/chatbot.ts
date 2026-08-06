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
  /**
   * Lien vers la source officielle (Légifrance pour un article de loi,
   * service-public.fr / caf.fr pour un contenu vulgarisé). Rendu en lien
   * cliquable : une citation qu'on ne peut pas aller vérifier n'en est pas une.
   */
  url?: string;
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
  intent: 'rag_general' | 'documents_necessaires' | 'estimation' | 'fondement_juridique';
  /**
   * Étape du dialogue, présente uniquement pour les questions posées par le code
   * et non par le modèle — la date d'une décision contestée se demande en deux
   * temps, et le profil déjà enregistré d'un citoyen connecté lui est relu avant
   * d'être utilisé. Le client la renvoie telle quelle, il n'a pas à l'interpréter.
   */
  step?: 'date_choix' | 'date_valeur' | 'date_valeur_2' | 'profil_confirmation' | null;
}

/**
 * L'action que le citoyen peut enchaîner sur MonParcours après la réponse.
 *
 * Une seule, décidée par le backend : l'assistant explique une démarche, et la
 * plateforme sert à la faire. Absente sur une question de clarification — on
 * n'interrompt pas un dialogue en cours par un bouton.
 */
export interface ChatbotCta {
  label: string;
  href: string;
  hint?: string | null;
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
   * COMMENT le message a été produit, quand une question de l'assistant était
   * affichée. `undefined` = message spontané, aucune question en attente.
   *
   * Remplace un booléen « est-ce une réponse ? ». Ce booléen demandait à l'UI un
   * jugement qu'elle ne peut pas rendre : ne disposant que d'un indice — des
   * boutons sont-ils affichés ? — elle traitait tout texte tapé comme un
   * changement de sujet. Une réponse écrite ou dictée n'atteignait donc jamais la
   * reconnaissance côté serveur, et l'entretien en cours pouvait être effacé.
   *
   * L'UI rapporte désormais un fait dont elle est seule témoin, et le backend
   * décide — lui seul connaît le vocabulaire attendu de chaque question.
   */
  clarificationReply?: 'option' | 'text' | null;
  /**
   * Droit applicable demandé sur la branche juridique : la date de la décision
   * contestée. Le backend ne garde pas de session, cet état vit ici entre deux
   * messages, exactement comme `conversationHistory`.
   */
  dateReference?: string | null;
  /** True une fois la question de date tranchée, pour ne pas la reposer. */
  dateAsked?: boolean;
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
  /** État du dialogue de date, à renvoyer tel quel au message suivant. */
  dateReference?: string | null;
  dateAsked?: boolean;
  /** Proposition d'action sur la plateforme, quand la réponse s'y prête. */
  cta?: ChatbotCta | null;
}

/**
 * A message as displayed in the assistant thread.
 *
 * Extends the shared `ChatMessage` rather than redefining it, so the existing
 * bubble rendering (suggestions, recommendation cards) keeps working unchanged
 * and only the citations are new.
 */
/**
 * Le fichier joint à un tour, tel qu'il s'affiche dans le fil.
 *
 * Des métadonnées, pas le fichier : une fois envoyé au serveur, l'objet `File`
 * n'a plus d'utilité côté vue, et le garder ferait vivre le contenu du CV dans
 * l'état de la conversation aussi longtemps que la page est ouverte.
 */
export interface ChatbotAttachment {
  name: string;
  /** Taille en octets, telle que rapportée par le `File` d'origine. */
  size: number;
}

export interface ChatbotMessage extends ChatMessage {
  /** Pièce jointe envoyée avec ce tour — un CV, sur le coach France Travail. */
  attachment?: ChatbotAttachment;
  /** Present on assistant turns that were grounded in retrieved documents. */
  sources?: ChatbotSource[];
  /** L'action proposée sous cette réponse, le cas échéant. */
  cta?: ChatbotCta;
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
