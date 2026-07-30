import { useCallback, useRef, useState } from 'react';

import { cvCoachService, type CvCoachTurn } from '@/services/cvCoachService';
import type { ChatbotController } from '@/features/chatbot/hooks/useChatbot';
import type { ChatbotMessage } from '@/features/chatbot/types/chatbot';

/**
 * Conversation state for the CV coach — a *new*, simpler hook, not a reuse
 * of `useChatbot`: that one is wired to `ChatbotContext`/
 * `pendingClarification`/`options`, none of which apply to a plain
 * back-and-forth about someone's work experience. Returns the same shape
 * (`ChatbotController`) so `ChatWindow`/`MessageBubble` need zero changes —
 * `selectOption` is a no-op here since coach replies never carry `options`.
 *
 * Stateless server-side, like the rest of this session's AI features: the
 * history sent with each turn is exactly what's already in `messages`.
 */
export function useCvCoachChat(): ChatbotController {
  const [messages, setMessages] = useState<ChatbotMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const messagesRef = useRef(messages);
  const isSendingRef = useRef(isSending);
  messagesRef.current = messages;
  isSendingRef.current = isSending;

  const send = useCallback((message: string) => {
    const question = message.trim();
    if (!question || isSendingRef.current) return;

    const history: CvCoachTurn[] = messagesRef.current.map((m) => ({
      role: m.role,
      content: m.content,
    }));

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

    cvCoachService
      .chat(question, history)
      .then((reply) => {
        setMessages((current) => [
          ...current,
          {
            id: `msg-${Date.now()}-assistant`,
            role: 'assistant',
            content: reply,
            createdAt: new Date().toISOString(),
          },
        ]);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => setIsSending(false));
  }, []);

  return { messages, isSending, error, send, selectOption: send };
}
