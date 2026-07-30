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
  | { type: 'navigate'; target: 'home' | 'documents' | 'dossier' }
  | { type: 'read_page' }
  | { type: 'stop_speaking' }
  | { type: 'explain_actions' }
  | { type: 'fill_field'; fieldId: string; value: string }
  | { type: 'sensitive_action'; actionId: string }
  | { type: 'click_action'; actionId: string }
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
  /** If true, the assistant will NOT repeat the value out loud (e.g. passwords). */
  sensitive?: boolean;
}

export interface VoicePageContextValue {
  readableText: string;
  actions: VoicePageAction[];
  fields?: VoicePageField[];
  /** Callbacks keyed by action ID, invoked when a click_action intent is confirmed. */
  actionCallbacks?: Record<string, () => void>;
}
