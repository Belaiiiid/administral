import { UploadCloud } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DropzoneProps {
  title?: string;
  hint?: string;
  inverted?: boolean;
  compact?: boolean;
  className?: string;
  onFilesSelected?: (files: File[]) => void;
  disabled?: boolean;
}

export function Dropzone({ title = 'Glissez vos fichiers ici', hint = 'Ou cliquez pour parcourir votre ordinateur', inverted = false, compact = false, className, onFilesSelected, disabled = false }: DropzoneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const selectFiles = (files: FileList | null) => {
    if (files?.length) onFilesSelected?.(Array.from(files));
  };
  const openPicker = () => !disabled && inputRef.current?.click();
  return (
    <div onDragOver={(event) => { event.preventDefault(); if (!disabled) setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)} onDrop={(event) => { event.preventDefault(); setIsDragOver(false); if (!disabled) selectFiles(event.dataTransfer.files); }} onClick={openPicker} role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPicker(); } }} className={cn('flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors duration-200', compact ? 'p-6' : 'p-12', inverted ? 'border-white/30 text-white hover:bg-white/10' : 'border-border bg-surface-lowest text-on-surface', isDragOver && !inverted && 'border-primary bg-primary-fixed/30', isDragOver && inverted && 'border-white bg-white/20', disabled && 'cursor-not-allowed opacity-60', className)}>
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple className="sr-only" onChange={(event) => selectFiles(event.target.files)} />
      <div className={cn('mb-4 flex size-14 items-center justify-center rounded-full', inverted ? 'bg-white/10' : 'bg-surface-low text-primary')}><UploadCloud className="size-6" aria-hidden="true" /></div>
      <p className={cn('text-label-md', inverted ? 'text-white' : 'text-on-surface')}>{title}</p>
      <p className={cn('mt-1 text-body-sm', inverted ? 'text-white/70' : 'text-on-surface-variant')}>{hint}</p>
      {!compact && <Button variant={inverted ? 'outline' : 'primary'} className="mt-6" type="button" disabled={disabled} onClick={(event) => { event.stopPropagation(); openPicker(); }}>Sélectionner des fichiers</Button>}
    </div>
  );
}
