import type { TextToSpeechProvider } from '../types';

export class MistralTtsProvider implements TextToSpeechProvider {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private endCb: (() => void) | null = null;

  isSupported(): boolean { return typeof Audio !== 'undefined'; }
  onEnd(cb: () => void): void { this.endCb = cb; }
  isSpeaking(): boolean { return !!this.audio && !this.audio.paused; }

  async speak(text: string): Promise<void> {
    this.stop();
    try {
      const res = await fetch('/api/voice/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'audio/wav' });
      this.objectUrl = URL.createObjectURL(blob);
      this.audio = new Audio(this.objectUrl);
      this.audio.onended = () => { this.cleanupAudio(); this.endCb?.(); };
      this.audio.onerror = () => { this.cleanupAudio(); this.endCb?.(); };
      await this.audio.play();
    } catch (err) {
      console.error('TTS error', err); this.cleanupAudio(); this.endCb?.();
    }
  }

  stop(): void { if (this.audio) { try { this.audio.pause(); } catch {} } this.cleanupAudio(); }

  private cleanupAudio(): void {
    if (this.audio) { this.audio.onended = null; this.audio.onerror = null; this.audio = null; }
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
  }
}
