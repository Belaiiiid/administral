import { useEffect, useState } from 'react';

import { useVoiceAssistant } from '@/features/voice/components/VoiceAssistantProvider';

/**
 * Wires the shared voice pipeline (STT via `VoiceAssistantProvider`) to an
 * ordinary text conversation.
 *
 * Speaking here is just another way to produce the same message a citizen
 * would have typed: the transcript is handed to `send` and lands in the same
 * message list, through the same RAG-backed chatbot — never a separate,
 * command-only engine standing in for the conversational assistant. This is
 * what turns two previously-separate widgets (text chat, voice commands)
 * into one multimodal composer.
 */
export function useVoiceComposer(send: (text: string) => void) {
  const { status, transcript, error, speakText, stopSpeaking, startPushToTalk, stopPushToTalk } =
    useVoiceAssistant();
  const [isRecording, setIsRecording] = useState(false);

  // A mic/permission error ends the recording state even though nothing
  // ever called stopPushToTalk — otherwise the button stays stuck "active".
  useEffect(() => {
    if (status === 'error') setIsRecording(false);
  }, [status]);

  const toggleRecording = () => {
    if (isRecording) {
      stopPushToTalk();
      setIsRecording(false);
      return;
    }
    setIsRecording(true);
    startPushToTalk((text) => {
      setIsRecording(false);
      if (text.trim()) send(text);
    });
  };

  return { status, transcript, error, isRecording, toggleRecording, speakText, stopSpeaking };
}
