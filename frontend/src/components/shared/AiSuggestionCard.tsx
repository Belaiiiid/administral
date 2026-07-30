import { Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AiSuggestionFeedback = 'up' | 'down';

export interface AiSuggestionCardProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  /** Footer feedback row (« Est-ce utile ? » + thumbs). */
  showFeedback?: boolean;
  actions?: React.ReactNode;
  /**
   * Called once the citizen picks a thumb. Optional: the card acknowledges
   * the click locally (an honest "merci" — no button ever does nothing) even
   * without a caller, but nothing is persisted unless this is provided.
   */
  onFeedback?: (feedback: AiSuggestionFeedback) => void;
}

/**
 * The single most repeated pattern in the mockups (6 screens):
 * 4px left accent border, #f0f4ff tint, optional feedback footer.
 */
export function AiSuggestionCard({
  title,
  children,
  actions,
  showFeedback = true,
  onFeedback,
  className,
  ...props
}: AiSuggestionCardProps) {
  const [feedback, setFeedback] = React.useState<AiSuggestionFeedback | null>(null);

  const handleFeedback = (value: AiSuggestionFeedback) => {
    setFeedback(value);
    onFeedback?.(value);
  };

  return (
    <section
      className={cn('rounded-lg border-l-4 border-l-ai bg-ai-surface p-6', className)}
      aria-label={`Suggestion de l'assistant : ${title}`}
      {...props}
    >
      <div className="flex gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-ai" aria-hidden="true" />
        <div className="flex-1">
          <h3 className="mb-1 text-label-md text-ai">{title}</h3>
          <div className="text-body-sm text-on-surface">{children}</div>
          {actions && <div className="mt-4 flex flex-wrap gap-3">{actions}</div>}
        </div>
      </div>

      {showFeedback && (
        <div className="mt-4 flex items-center justify-between border-t border-ai/10 pt-3">
          <span className="text-label-sm italic text-on-surface-variant">
            {feedback ? 'Merci pour votre retour !' : 'Est-ce utile ?'}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn('size-9', feedback === 'up' && 'text-primary')}
              aria-label="Cette suggestion est utile"
              aria-pressed={feedback === 'up'}
              disabled={feedback !== null}
              onClick={() => handleFeedback('up')}
            >
              <ThumbsUp aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('size-9', feedback === 'down' && 'text-destructive')}
              aria-label="Cette suggestion n'est pas utile"
              aria-pressed={feedback === 'down'}
              disabled={feedback !== null}
              onClick={() => handleFeedback('down')}
            >
              <ThumbsDown aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
