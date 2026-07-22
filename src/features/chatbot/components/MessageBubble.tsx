import { BookOpen, Bot, FileUp, ThumbsDown, ThumbsUp, User } from 'lucide-react';

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
}

export function MessageBubble({ message, onSuggestionSelect }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <li className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <span
        aria-hidden="true"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          isUser
            ? 'bg-surface-container text-on-surface-variant'
            : 'bg-primary text-primary-foreground',
        )}
      >
        {isUser ? <User className="size-5" /> : <Bot className="size-5" />}
      </span>

      <div className={cn('flex max-w-[80%] flex-col gap-3', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-xl px-4 py-3 text-body-md',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-surface-low text-on-surface',
          )}
        >
          <span className="sr-only">{isUser ? 'Vous : ' : 'Assistant : '}</span>
          {message.content}
        </div>

        {message.sources && <SourceCitation sources={message.sources} />}

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
                <Button key={action.id} variant="outline" className="justify-center">
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
              <span className="text-label-sm italic text-on-surface-variant">Est-ce utile ?</span>
              <span className="flex gap-1">
                <Button variant="ghost" size="icon" className="size-9" aria-label="Réponse utile">
                  <ThumbsUp aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Réponse non utile"
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
