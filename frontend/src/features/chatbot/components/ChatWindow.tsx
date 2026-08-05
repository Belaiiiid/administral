import { Mic, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AssistantMascot, AssistantMascotGlyph } from '@/features/chatbot/components/AssistantMascot';
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
 * Openers offered on an empty thread, when the caller doesn't supply its own
 * (see `ChatWindowProps.starterQuestions`) — the APL assistant's defaults.
 *
 * Questions about the *rules*, not about the citizen's own file: at this point
 * the assistant has no context, and an opener it cannot answer well is a bad
 * first impression of it.
 */
const DEFAULT_STARTER_QUESTIONS = [
  'Quels documents pour l’APL ?',
  'Que signifie justificatif de ressources ?',
  'Comment se déroule l’instruction d’un dossier ?',
];

export interface ChatWindowProps {
  controller: ChatbotController;
  /** Overrides the empty-thread openers — a different assistant (e.g. the CV
   *  coach) needs prompts relevant to *its* domain, not APL's. */
  starterQuestions?: string[];
  /**
   * Mic button in the composer, next to Send — omitted wherever no voice
   * pipeline is mounted (e.g. outside `VoiceAssistantProvider`). Voice is
   * just another way to produce the message this window already sends;
   * this component stays presentation-only and owns none of the recording
   * state itself.
   */
  onVoiceInput?: () => void;
  isRecording?: boolean;
  /**
   * Fenêtre de chat plein écran : la fenêtre prend toute la hauteur qu'on lui
   * donne, seul le fil des messages défile, et le composeur reste ancré en bas.
   *
   * Opt-in, parce que les trois autres hôtes (panneau flottant, landing
   * publique, coach CV) posent cette fenêtre dans une page qui défile
   * normalement : leur imposer une hauteur pleine la couperait.
   */
  fill?: boolean;
}

export function ChatWindow({
  controller,
  starterQuestions = DEFAULT_STARTER_QUESTIONS,
  onVoiceInput,
  isRecording = false,
  fill = false,
}: ChatWindowProps) {
  const { messages, isSending, error, send, selectOption } = controller;
  const [draft, setDraft] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Keep the latest turn in view as the conversation grows. En mode plein
  // écran on pousse directement le conteneur en bas de sa hauteur de défilement
  // — c'est lui le seul élément qui défile, viser le repère de fin reviendrait
  // au même en moins direct.
  useEffect(() => {
    if (fill && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
      return;
    }
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, isSending, fill]);

  const submit = (question: string) => {
    send(question);
    setDraft('');
  };

  return (
    <section
      className={cn(
        'flex flex-col lg:col-span-2',
        // `min-h-0` : sans lui, un enfant en `flex-1` refuse de rétrécir sous
        // la hauteur de son contenu et le fil déborderait au lieu de défiler.
        fill && 'h-full min-h-0',
      )}
      aria-label="Conversation avec l’assistant"
    >
      <h1 className="sr-only">Assistant</h1>

      <div
        ref={threadRef}
        className={cn('flex flex-col', fill && 'min-h-0 flex-1 overflow-y-auto pr-1')}
      >
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
              <AssistantMascot />
              <p className="self-center text-body-sm italic text-on-surface-variant">
                L’assistant rédige une réponse…
              </p>
            </li>
          )}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          {/* État vide écrit ici plutôt qu'avec `EmptyState` : la mascotte y
              est le sujet, pas un pictogramme dans une pastille de 64 px —
              ce composant partagé contraint la taille de son icône. */}
          <div className="flex flex-col items-center px-6 text-center">
            <AssistantMascotGlyph className="-mb-2 w-56 max-w-full" />
            <h3 className="text-headline-md text-on-surface">Aucune conversation</h3>
            <p className="mt-2 max-w-md text-body-md text-on-surface-variant">
              Posez une question pour démarrer un échange avec l’assistant.
            </p>
          </div>

          <ul className="flex flex-wrap justify-center gap-2">
            {starterQuestions.map((question) => (
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
      </div>

      {error && (
        <Alert tone="error" className="mt-6">
          <AlertDescription>
            La réponse n’a pas pu être obtenue : {error.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Composer — ancré en bas : hauteur propre, jamais dans la zone qui
          défile. Hors mode plein écran il reste `sticky`, la page hôte étant
          elle-même le conteneur de défilement. */}
      <div
        className={cn(
          'mt-8 bg-background pt-4',
          fill ? 'shrink-0' : 'sticky bottom-0',
        )}
      >
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

          {onVoiceInput && (
            <Button
              type="button"
              size="icon"
              variant={isRecording ? 'destructive' : 'outline'}
              aria-label={isRecording ? 'Arrêter l’enregistrement et envoyer' : 'Poser la question à l’oral'}
              aria-pressed={isRecording}
              onClick={onVoiceInput}
              disabled={isSending}
            >
              <Mic aria-hidden="true" />
            </Button>
          )}

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
