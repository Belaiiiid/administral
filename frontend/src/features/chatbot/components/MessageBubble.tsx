import { ArrowRight, BookOpen, FileUp, Paperclip, ThumbsDown, ThumbsUp, User } from 'lucide-react';

import { AssistantMascot } from '@/features/chatbot/components/AssistantMascot';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SourceCitation } from '@/features/chatbot/components/SourceCitation';
import type { ChatbotMessage } from '@/features/chatbot/types/chatbot';

/**
 * One turn in the assistant thread.
 *
 * Lifted verbatim out of `ChatPage` — the markup, classes and accessibility
 * affordances are unchanged — and extended with the citations block. It renders
 * what it is given and nothing else: no fetching, no formatting of an answer,
 * no decision about whether a source is worth showing.
 */
export interface MessageBubbleProps {
  message: ChatbotMessage;
  /** Fills the composer with a quick-reply chip. Chips are inert without it. */
  onSuggestionSelect?: (suggestion: string) => void;
  /**
   * Répond à une question de clarification. Fourni uniquement pour le dernier
   * tour : les choix d'une question déjà passée ne sont plus proposés, on ne
   * répond pas deux tours plus tard à une question qui n'attend plus rien.
   */
  onOptionSelect?: (option: string) => void;
}

export function MessageBubble({
  message,
  onSuggestionSelect,
  onOptionSelect,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const navigate = useNavigate();
  // No backend endpoint persists this vote today — recorded only so the
  // citizen who clicked gets an honest, immediate acknowledgement instead of
  // a button that visibly does nothing. Never claims to be saved server-side.
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  return (
    <li id={`chat-message-${message.id}`} className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {isUser ? (
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant"
        >
          <User className="size-5" />
        </span>
      ) : (
        <AssistantMascot />
      )}

      <div className={cn('flex max-w-[80%] flex-col gap-3', isUser && 'items-end')}>
        {/* Pièce jointe : une carte dans le fil, au même titre qu'un message
            écrit. Le fichier lui-même n'est pas conservé, seuls son nom et sa
            taille — c'est tout ce que la vue a à montrer. */}
        {message.attachment && (
          <div className="flex max-w-full items-center gap-3 rounded-xl border border-border bg-surface-low p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Paperclip className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-label-md text-on-surface">
                {message.attachment.name}
              </span>
              <span className="block text-body-sm text-on-surface-variant">
                {(message.attachment.size / 1024).toFixed(0)} Ko
              </span>
            </span>
          </div>
        )}

        {/* Un tour qui ne porte qu'une pièce jointe n'a pas de bulle vide. */}
        {message.content && (
          <div
            className={cn(
              // `whitespace-pre-line` : certaines réponses sont des listes (la
              // checklist de documents, une pièce par ligne). Sans ça, tout se
              // recolle en un pavé.
              'whitespace-pre-line rounded-xl px-4 py-3 text-body-md',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-surface-low text-on-surface',
            )}
          >
            <span className="sr-only">{isUser ? 'Vous : ' : 'Assistant : '}</span>
            {message.content}
          </div>
        )}

        {message.sources && <SourceCitation sources={message.sources} />}

        {message.cta && (
          <div className="w-full rounded-lg border-l-4 border-l-ai bg-ai-surface p-3">
            {message.cta.hint && (
              <p className="mb-2 text-body-sm text-on-surface">{message.cta.hint}</p>
            )}
            <Button asChild size="sm" variant="outline" className="bg-surface-lowest">
              <Link to={message.cta.href}>
                {message.cta.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        )}

        {message.options && onOptionSelect && (
          <ul className="flex flex-wrap gap-2">
            {message.options.map((option) => (
              <li key={option}>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => onOptionSelect(option)}
                >
                  {option}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {message.suggestions && (
          <ul className="flex flex-wrap gap-2">
            {message.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => onSuggestionSelect?.(suggestion)}
                >
                  {suggestion}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {message.recommendation && (
          <div className="w-full rounded-lg border-l-4 border-l-ai bg-ai-surface p-4">
            <p className="mb-1 text-label-md text-ai">{message.recommendation.title}</p>
            <p className="mb-4 text-body-sm text-on-surface">{message.recommendation.body}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              {message.recommendation.actions.map((action) => (
                <Button
                  key={action.id}
                  variant="outline"
                  className="justify-center"
                  onClick={() => navigate(action.icon === 'upload' ? ROUTES.dossier : ROUTES.documents)}
                >
                  {action.icon === 'upload' ? (
                    <FileUp aria-hidden="true" />
                  ) : (
                    <BookOpen aria-hidden="true" />
                  )}
                  {action.label}
                </Button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-ai/10 pt-3">
              <span className="text-label-sm italic text-on-surface-variant">
                {feedback ? 'Merci pour votre retour !' : 'Est-ce utile ?'}
              </span>
              <span className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('size-9', feedback === 'up' && 'text-primary')}
                  aria-label="Réponse utile"
                  aria-pressed={feedback === 'up'}
                  disabled={feedback !== null}
                  onClick={() => setFeedback('up')}
                >
                  <ThumbsUp aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('size-9', feedback === 'down' && 'text-destructive')}
                  aria-label="Réponse non utile"
                  aria-pressed={feedback === 'down'}
                  disabled={feedback !== null}
                  onClick={() => setFeedback('down')}
                >
                  <ThumbsDown aria-hidden="true" />
                </Button>
              </span>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
