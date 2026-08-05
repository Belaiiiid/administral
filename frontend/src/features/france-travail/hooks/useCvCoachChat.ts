import { useCallback, useRef, useState } from 'react';

import { cvCoachService, type CvCoachTurn } from '@/services/cvCoachService';
import type { ChatbotController } from '@/features/chatbot/hooks/useChatbot';
import type { ChatbotMessage } from '@/features/chatbot/types/chatbot';
import type { CvReviewResult } from '@/types';

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
/** `ChatbotController`, plus l'envoi d'un CV dans le même fil. */
export interface CvCoachController extends ChatbotController {
  /** Envoie un CV : la pièce jointe et la relecture sont deux tours du fil. */
  sendCv: (file: File) => void;
}

/**
 * Met en phrases la relecture structurée renvoyée par le serveur.
 *
 * Le fil ne montre que du texte : une réponse à un fichier doit se lire comme
 * une réponse à une question. La note « je commente, je ne réécris pas »
 * apparaît ici, après réception du CV, plutôt qu'en permanence avant tout envoi.
 */
function reviewToReply(result: CvReviewResult): string {
  if (!result.available) {
    return (
      result.unavailableReason ??
      'La relecture n’a pas abouti. Réessayez dans un instant.'
    );
  }

  const section = (title: string, items: string[]) =>
    items.length > 0 ? `${title}\n${items.map((item) => `• ${item}`).join('\n')}` : null;

  return [
    'J’ai lu votre CV. Je le commente, je ne le réécris pas à votre place.',
    section('Points forts', result.pointsForts),
    section('Points à améliorer', result.pointsAAmeliorer),
    section('Conseils', result.conseils),
    'Dites-moi sur quel point vous voulez qu’on avance.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function useCvCoachChat(): CvCoachController {
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

  const sendCv = useCallback((file: File) => {
    if (isSendingRef.current) return;

    setMessages((current) => [
      ...current,
      {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: '',
        attachment: { name: file.name, size: file.size },
        createdAt: new Date().toISOString(),
      },
    ]);

    isSendingRef.current = true;
    setIsSending(true);
    setError(null);

    cvCoachService
      .review(file)
      .then((result) => {
        setMessages((current) => [
          ...current,
          {
            id: `msg-${Date.now()}-assistant`,
            role: 'assistant',
            content: reviewToReply(result),
            createdAt: new Date().toISOString(),
          },
        ]);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => setIsSending(false));
  }, []);

  return { messages, isSending, error, send, selectOption: send, sendCv };
}
