import { Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AiSuggestionCardProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  /** Footer feedback row (« Est-ce utile ? » + thumbs). */
  showFeedback?: boolean;
  actions?: React.ReactNode;
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
  className,
  ...props
}: AiSuggestionCardProps) {
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
          <span className="text-label-sm italic text-on-surface-variant">Est-ce utile ?</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="size-9" aria-label="Cette suggestion est utile">
              <ThumbsUp aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Cette suggestion n'est pas utile"
            >
              <ThumbsDown aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
