import { Mic, Square, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { VoiceStatus } from '@/features/voice/components/VoiceAssistantProvider';

export interface VoiceStatusStripProps {
  status: VoiceStatus;
  transcript: string;
  error: string | null;
  onStopSpeaking: () => void;
}

/**
 * Compact, inline voice feedback for the unified chat widget.
 *
 * Replaces the old floating `VoiceAssistantPanel`, which drew its own status
 * box on top of the conversation instead of inside it — the same
 * information (listening/speaking/error), but as part of the one widget
 * rather than a second surface competing for the same corner of the screen.
 *
 * Silent (renders nothing) outside those three states, so it never crowds
 * the message list while idle.
 */
export function VoiceStatusStrip({ status, transcript, error, onStopSpeaking }: VoiceStatusStripProps) {
  if (status !== 'listening' && status !== 'speaking' && status !== 'error') return null;

  return (
    <div className="border-b border-border bg-surface-low px-4 py-2">
      <p className="flex items-center gap-2 text-body-sm text-on-surface-variant" role="status">
        {status === 'error' ? (
          <span className="text-destructive">{error ?? 'Erreur du microphone.'}</span>
        ) : status === 'listening' ? (
          <>
            <Mic className="size-4 shrink-0 animate-pulse text-primary" aria-hidden="true" />
            {transcript ? `« ${transcript} »` : 'Je vous écoute…'}
          </>
        ) : (
          <>
            <Volume2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            L’assistant lit sa réponse à voix haute…
          </>
        )}
      </p>
      {status === 'speaking' && (
        <Button variant="ghost" size="sm" className="mt-1 h-8 gap-1.5 px-2" onClick={onStopSpeaking}>
          <Square className="size-3.5" aria-hidden="true" />
          Arrêter la lecture
        </Button>
      )}
    </div>
  );
}
