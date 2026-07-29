export interface SpeechToTextProvider {
  start(): void;
  stop(): void;
  isSupported(): boolean;
  onTranscript(callback: (text: string) => void): void;
  onError(callback: (message: string) => void): void;
}

export interface TextToSpeechProvider {
  speak(text: string): void;
  stop(): void;
  isSpeaking(): boolean;
  isSupported(): boolean;
  onEnd(callback: () => void): void;
}

export type VoiceIntent =
  | { type: 'navigate'; target: 'home' | 'documents' }
  | { type: 'read_page' }
  | { type: 'stop_speaking' }
  | { type: 'explain_actions' }
  | { type: 'fill_field'; fieldId: string; value: string }
  | { type: 'sensitive_action'; actionId: string }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'unknown'; transcript: string };

export interface VoicePageAction {
  id: string;
  label: string;
  description: string;
  intent: VoiceIntent;
  sensitive?: boolean;
}

export interface VoicePageField {
  fieldId: string;
  labels: string[];
  setValue: (value: string) => void;
}

export interface VoicePageContextValue {
  readableText: string;
  actions: VoicePageAction[];
  fields?: VoicePageField[];
}
