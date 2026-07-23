import { useCallback, useRef, useState } from 'react';

import { chatbotService } from '@/features/chatbot/services';
import type { ChatbotContext, ChatbotMessage } from '@/features/chatbot/types/chatbot';

export interface ChatbotController {
  /** The thread, oldest first. Empty until the citizen asks something. */
  messages: ChatbotMessage[];
  /** True while an answer is pending — drives the typing indicator. */
  isSending: boolean;
  /** A failed exchange. The question stays in the thread so it can be retried. */
  error: Error | null;
  /** Ask a question. No-op on empty input or while a reply is in flight. */
  send: (message: string) => void;
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
 * @param context What is known about the citizen's situation, forwarded with
 *                every question. Pass only values that are genuinely known;
 *                omitted fields mean "unknown" (see {@link ChatbotContext}).
 */
export function useChatbot(context?: ChatbotContext): ChatbotController {
  const [messages, setMessages] = useState<ChatbotMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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

  const send = useCallback((message: string) => {
    const question = message.trim();
    if (!question || isSendingRef.current) return;

    /*
     * The history sent to the service is the thread *before* this question —
     * the backend receives prior turns as context and the new question as the
     * question, never the question twice.
     */
    const conversationHistory = messagesRef.current;

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
      .sendMessage(question, { ...contextRef.current, conversationHistory })
      .then((response) => {
        setMessages((current) => [
          ...current,
          {
            id: `msg-${Date.now()}-assistant`,
            role: 'assistant',
            content: response.answer,
            createdAt: new Date().toISOString(),
            sources: response.sources,
          },
        ]);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => setIsSending(false));
  }, []);

  return { messages, isSending, error, send };
}
