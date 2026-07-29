import React, { useContext } from 'react';
import { Home, Files, Volume2, Square, HelpCircle, Mic } from 'lucide-react';
import { useVoiceAssistant } from './VoiceAssistantProvider';
import { useVoiceStore } from '../store/voiceStore';
import { Button } from '@/components/ui/button';
import { VoicePageContext } from '../context/VoicePageContext';

export const VoiceAssistantPanel: React.FC = () => {
  const { modeVocal } = useVoiceStore();
  const { status, transcript, error, isWaitingForConfirmation, speakText, stopSpeaking, triggerCommand, startPushToTalk, stopPushToTalk } = useVoiceAssistant();
  const pageContext = useContext(VoicePageContext);
  if (!modeVocal) return null;

  const handleReadPage = () => { if (pageContext?.readableText) speakText(pageContext.readableText); else speakText("Il n'y a aucun contenu lisible sur cette page."); };
  const handleExplainActions = () => { if (pageContext?.actions?.length) speakText(`Sur cette page, tu peux : ${pageContext.actions.map(a => a.description).join('. ')}`); else speakText("Aucune action n'est disponible sur cette page."); };

  let statusText = 'En veille — cliquez sur le micro pour parler';
  let statusColorClass = 'bg-outline text-on-surface-variant';
  let statusAnimationClass = '';
  if (status === 'listening') { statusText = isWaitingForConfirmation ? 'Confirme par "oui" ou "non"' : "Je t'écoute…"; statusColorClass = 'bg-primary text-white'; statusAnimationClass = 'animate-pulse'; }
  else if (status === 'speaking') { statusText = 'Parle...'; statusColorClass = 'bg-secondary text-white'; }
  else if (status === 'error') { statusText = 'Erreur'; statusColorClass = 'bg-destructive text-white'; }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col rounded-2xl border border-border bg-surface-lowest/90 p-5 shadow-2xl backdrop-blur-md transition-all duration-300 md:bottom-8 md:right-8 animate-in fade-in slide-in-from-bottom-5">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-3">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColorClass} ${statusAnimationClass}`} />
            <span className={`relative inline-flex size-3 rounded-full ${statusColorClass}`} />
          </span>
          <span className="text-label-md font-semibold text-on-surface">Assistant Vocal</span>
        </div>
      </div>

      <div className="my-4 flex flex-col gap-3 rounded-xl bg-surface-low p-4 min-h-24 justify-center">
        <p className="text-body-sm text-outline font-medium">{statusText}</p>
        {status === 'error' && error ? (
          <div className="flex items-start gap-2 text-destructive"><p className="text-body-sm">{error}</p></div>
        ) : transcript ? (
          <div className="flex gap-2 items-start"><Mic className="size-4 shrink-0 mt-1 text-primary animate-pulse" /><p className="text-body-md text-on-surface italic">"{transcript}"</p></div>
        ) : (
          <p className="text-body-sm text-on-surface-variant italic">Cliquez sur le micro puis parlez</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Boutons de secours</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="flex items-center justify-start gap-2 h-11 text-body-sm rounded-xl" onClick={() => triggerCommand("assistant aller a l'accueil") }>
            <Home className="size-4" /> Accueil
          </Button>
          <Button variant="outline" className="flex items-center justify-start gap-2 h-11 text-body-sm rounded-xl" onClick={() => triggerCommand('assistant ouvrir mes documents')}>
            <Files className="size-4" /> Documents
          </Button>
          <Button variant="outline" className="flex items-center justify-start gap-2 h-11 text-body-sm rounded-xl" onClick={handleReadPage}>
            <Volume2 className="size-4" /> Lire la page
          </Button>
          <Button variant="outline" className="flex items-center justify-start gap-2 h-11 text-body-sm rounded-xl" onClick={handleExplainActions}>
            <HelpCircle className="size-4" /> Actions possibles
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Button variant="default" className="flex items-center justify-center gap-2 h-11 rounded-xl select-none" onMouseDown={startPushToTalk} onMouseUp={stopPushToTalk} onTouchStart={startPushToTalk} onTouchEnd={stopPushToTalk} disabled={status === 'speaking'}>
            <Mic className="size-4" /> Appuyer pour parler
          </Button>
          <Button variant="destructive" className="flex items-center justify-center gap-2 h-11 rounded-xl" onClick={stopSpeaking} disabled={status !== 'speaking'}>
            <Square className="size-4" /> Arrêter de parler
          </Button>
        </div>
      </div>
    </div>
  );
};
