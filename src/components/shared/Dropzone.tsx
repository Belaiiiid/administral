import { UploadCloud } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DropzoneProps {
  title?: string;
  hint?: string;
  /** Inverted styling for placement on a dark (primary-container) surface. */
  inverted?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * 2px dashed dropzone. The drag-over state (primary border + tint) is wired,
 * but file handling is intentionally left to the future upload module.
 */
export function Dropzone({
  title = 'Glissez vos fichiers ici',
  hint = 'Ou cliquez pour parcourir votre ordinateur',
  inverted = false,
  compact = false,
  className,
}: DropzoneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
      }}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors duration-200',
        compact ? 'p-6' : 'p-12',
        inverted
          ? 'border-white/30 text-white hover:bg-white/10'
          : 'border-border bg-surface-lowest text-on-surface',
        isDragOver && !inverted && 'border-primary bg-primary-fixed/30',
        isDragOver && inverted && 'border-white bg-white/20',
        className,
      )}
    >
      <div
        className={cn(
          'mb-4 flex size-14 items-center justify-center rounded-full',
          inverted ? 'bg-white/10' : 'bg-surface-low text-primary',
        )}
      >
        <UploadCloud className="size-6" aria-hidden="true" />
      </div>
      <p className={cn('text-label-md', inverted ? 'text-white' : 'text-on-surface')}>{title}</p>
      <p
        className={cn(
          'mt-1 text-body-sm',
          inverted ? 'text-white/70' : 'text-on-surface-variant',
        )}
      >
        {hint}
      </p>
      {!compact && (
        <Button variant={inverted ? 'outline' : 'primary'} className="mt-6" type="button">
          Sélectionner des fichiers
        </Button>
      )}
    </div>
  );
}
