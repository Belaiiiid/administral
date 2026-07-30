import { useCallback, useEffect, useRef, useState } from 'react';

import { chatbotService } from '@/features/chatbot/services';
import type {
  ChatbotContext,
  ChatbotMessage,
  ChatbotPendingClarification,
  ChatHistoryMessage,
} from '@/features/chatbot/types/chatbot';
import { useSessionStore } from '@/store/sessionStore';

function fromHistory(item: ChatHistoryMessage): ChatbotMessage {
  return {
    id: `history-${item.id}`,
    role: item.role,
    content: item.content,
    createdAt: item.createdAt,
    sources: item.sources ?? undefined,
  };
}

export interface ChatbotController {
  /** The thread, oldest first. Empty until the citizen asks something. */
  messages: ChatbotMessage[];
  /** True while an answer is pending — drives the typing indicator. */
  isSending: boolean;
  /** A failed exchange. The question stays in the thread so it can be retried. */
  error: Error | null;
  /** Ask a question. No-op on empty input or while a reply is in flight. */
  send: (message: string) => void;
  /**
   * Répondre à la question de l'assistant en choisissant un des `options` du
   * dernier tour. Distinct de `send` : ce chemin est marqué comme réponse de
   * clarification, ce qui court-circuite la classification d'intention côté
   * backend — un « je suis locataire, mon loyer est de 400 € » cliqué ne peut
   * donc pas être pris pour une nouvelle demande.
   */
  selectOption: (option: string) => void;
}

/**
 * Conversation state for the citizen assistant.
 *
 * A command hook, not a fetch-on-mount one: the assistant speaks when spoken to.
 * All it does is append turns and call the service — it does not choose an
 * answer, rank a source, or decide when the assistant should decline. Those live
 * behind `chatbotService`, and behind it the backend that retrieves the sources
 * and composes the answer.
 *
 * Une seule règle de conversation vit ici, et elle est délibérée : quand
 * l'assistant pose une question **à choix**, un texte tapé dans le composeur est
 * traité comme un changement de sujet (il repasse par la classification), tandis
 * qu'un clic sur un choix est une réponse. Quand la question attend une **valeur
 * libre** (un montant, une date — pas d'`options`), le texte tapé EST la réponse.
 * Le backend ne devine jamais cette distinction : c'est l'UI qui sait d'où vient
 * le message.
 *
 * Signed-in citizens get one more thing for free: on mount, their persisted
 * thread (`GET /citizen/chatbot/history`) seeds `messages`, so leaving `/chat`
 * and coming back shows the conversation instead of a blank thread. An
 * anonymous visitor never triggers that fetch — nothing was stored for them,
 * so there is nothing to restore, and their thread stays exactly as ephemeral
 * as it already was.
 *
 * @param context What is known about the citizen's situation, forwarded with
 *                every question. Pass only values that are genuinely known;
 *                omitted fields mean "unknown" (see {@link ChatbotContext}).
 */
export function useChatbot(context?: ChatbotContext): ChatbotController {
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const [messages, setMessages] = useState<ChatbotMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    chatbotService
      .getHistory()
      .then((history) => {
        if (cancelled || history.length === 0) return;
        setMessages((current) => (current.length > 0 ? current : history.map(fromHistory)));
      })
      .catch(() => {
        // Best-effort restore: a failed fetch just leaves the thread empty,
        // exactly as it already is before any question is asked.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  /*
   * Three render-synced mirrors, so `send` can be created once and stay stable
   * for the whole conversation. Reading the state variables directly would put
   * them in the dependency list, giving the composer a new callback after every
   * exchange.
   *
   * Safe because `send` only ever runs from an event handler — after the render
   * that refreshed these.
   */
  const contextRef = useRef(context);
  const messagesRef = useRef(messages);
  const isSendingRef = useRef(isSending);
  contextRef.current = context;
  messagesRef.current = messages;
  isSendingRef.current = isSending;

  // L'état de la clarification en cours. Volontairement dans des refs et non
  // dans le state : rien ne s'affiche à partir de lui, il ne sert qu'à décrire
  // le message suivant.
  const pendingRef = useRef<ChatbotPendingClarification | null>(null);
  const pendingHasOptionsRef = useRef(false);
  // Branche juridique : quel droit servir. Renvoyé à chaque message parce que le
  // backend ne garde aucune session — une fois la date connue, elle n'est plus
  // redemandée.
  const dateReferenceRef = useRef<string | null>(null);
  const dateAskedRef = useRef(false);

  const ask = useCallback((question: string, isClarificationReply: boolean) => {
    if (!question || isSendingRef.current) return;

    /*
     * The history sent to the service is the thread *before* this question —
     * the backend receives prior turns as context and the new question as the
     * question, never the question twice.
     */
    const conversationHistory = messagesRef.current;
    const pendingClarification = pendingRef.current ?? undefined;

    setMessages((current) => [
      ...current,
      {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: question,
        createdAt: new Date().toISOString(),
      },
    ]);

    isSendingRef.current = true;
    setIsSending(true);
    setError(null);

    chatbotService
      .sendMessage(question, {
        ...contextRef.current,
        conversationHistory,
        pendingClarification,
        isClarificationReply,
        dateReference: dateReferenceRef.current,
        dateAsked: dateAskedRef.current,
      })
      .then((response) => {
        pendingRef.current = response.pendingClarification ?? null;
        pendingHasOptionsRef.current = (response.options?.length ?? 0) > 0;
        dateReferenceRef.current = response.dateReference ?? null;
        dateAskedRef.current = response.dateAsked ?? false;

        setMessages((current) => [
          ...current,
          {
            id: `msg-${Date.now()}-assistant`,
            role: 'assistant',
            content: response.answer,
            createdAt: new Date().toISOString(),
            sources: response.sources,
            options: response.options ?? undefined,
            cta: response.cta ?? undefined,
          },
        ]);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => setIsSending(false));
  }, []);

  const send = useCallback(
    (message: string) => {
      const question = message.trim();
      // Réponse libre attendue (clarification sans choix) → c'est une réponse.
      // Question à choix en attente → un texte tapé change de sujet.
      const answersFreeValue = pendingRef.current !== null && !pendingHasOptionsRef.current;
      ask(question, answersFreeValue);
    },
    [ask],
  );

  const selectOption = useCallback(
    (option: string) => {
      ask(option.trim(), pendingRef.current !== null);
    },
    [ask],
  );

  return { messages, isSending, error, send, selectOption };
}
