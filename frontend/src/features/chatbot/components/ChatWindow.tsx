import { Bot, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { EmptyState } from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageBubble } from '@/features/chatbot/components/MessageBubble';
import type { ChatbotController } from '@/features/chatbot/hooks/useChatbot';

/**
 * The conversation surface: thread, pending indicator and composer.
 *
 * Presentation only. It holds the draft the citizen is typing — genuinely local
 * UI state — and nothing else; the thread, the pending flag and the send action
 * all arrive from `useChatbot`. The service behind it could be swapped for any
 * other and nothing in this file would change.
 */

/**
 * Openers offered on an empty thread.
 *
 * Questions about the *rules*, not about the citizen's own file: at this point
 * the assistant has no context, and an opener it cannot answer well is a bad
 * first impression of it.
 */
const STARTER_QUESTIONS = [
  'Quels documents pour l’APL ?',
  'Que signifie justificatif de ressources ?',
  'Comment se déroule l’instruction d’un dossier ?',
];

export interface ChatWindowProps {
  controller: ChatbotController;
}

export function ChatWindow({ controller }: ChatWindowProps) {
  const { messages, isSending, error, send, selectOption } = controller;
  const [draft, setDraft] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Keep the latest turn in view as the conversation grows.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, isSending]);

  const submit = (question: string) => {
    send(question);
    setDraft('');
  };

  return (
    <section className="flex flex-col lg:col-span-2" aria-label="Conversation avec l’assistant">
      <h1 className="sr-only">Assistant</h1>

      {messages.length > 0 ? (
        <ul className="flex flex-1 flex-col gap-6" aria-live="polite" aria-busy={isSending}>
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              onSuggestionSelect={submit}
              // Seuls les choix du dernier tour restent cliquables : une question
              // de clarification déjà dépassée n'attend plus de réponse.
              onOptionSelect={
                index === messages.length - 1 && !isSending ? selectOption : undefined
              }
            />
          ))}

          {isSending && (
            <li className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              >
                <Bot className="size-5" />
              </span>
              <p className="self-center text-body-sm italic text-on-surface-variant">
                L’assistant rédige une réponse…
              </p>
            </li>
          )}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <EmptyState
            icon={Bot}
            title="Aucune conversation"
            description="Posez une question pour démarrer un échange avec l’assistant."
          />

          <ul className="flex flex-wrap justify-center gap-2">
            {STARTER_QUESTIONS.map((question) => (
              <li key={question}>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => submit(question)}
                >
                  {question}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div ref={threadEndRef} />

      {error && (
        <Alert tone="error" className="mt-6">
          <AlertDescription>
            La réponse n’a pas pu être obtenue : {error.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Composer */}
      <div className="sticky bottom-0 mt-8 bg-background pt-4">
        <form
          className="flex items-end gap-2 rounded-xl border border-border bg-surface-lowest p-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Votre message
          </label>
          <Textarea
            id="chat-input"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            // Enter sends; Shift+Enter breaks the line, as in every chat UI.
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit(draft);
              }
            }}
            placeholder="Posez votre question ici…"
            className="min-h-11 resize-none border-0 focus-visible:ring-0"
          />

          <Button
            type="submit"
            size="icon"
            aria-label="Envoyer le message"
            disabled={isSending || draft.trim().length === 0}
          >
            <Send aria-hidden="true" />
          </Button>
        </form>

        <p className="mt-2 text-center text-body-sm text-on-surface-variant">
          L’assistant peut faire des erreurs. Vérifiez les informations importantes.
        </p>
      </div>
    </section>
  );
}
