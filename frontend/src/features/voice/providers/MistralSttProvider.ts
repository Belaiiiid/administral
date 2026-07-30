import type { SpeechToTextProvider } from '../types';

export class MistralSttProvider implements SpeechToTextProvider {
  private mediaStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private uploading = false;
  private abortController: AbortController | null = null;
  private transcriptCb: ((text: string) => void) | null = null;
  private errorCb: ((message: string) => void) | null = null;
  private readonly sliceMs: number;
  private readonly deferUpload: boolean;
  private bufferedBlobs: Blob[] = [];
  private streamBufferBlobs: Blob[] = [];
  private streamBufferBytes = 0;
  private readonly minSliceBytes: number;
  private readonly coalesceTargetBytes: number;
  private readonly coalesceMinSlices: number;
  private pendingQueue: Blob[] = [];

  constructor(opts?: { sliceMs?: number; deferUpload?: boolean; minSliceBytes?: number; coalesceTargetBytes?: number; coalesceMinSlices?: number }) {
    this.sliceMs = opts?.sliceMs ?? 3000;
    this.deferUpload = !!opts?.deferUpload;
    this.minSliceBytes = opts?.minSliceBytes ?? 40000;
    this.coalesceTargetBytes = opts?.coalesceTargetBytes ?? 120000;
    this.coalesceMinSlices = opts?.coalesceMinSlices ?? 3;
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && !!(navigator.mediaDevices && (window as any).MediaRecorder);
  }

  onTranscript(cb: (text: string) => void): void { this.transcriptCb = cb; }
  onError(cb: (message: string) => void): void { this.errorCb = cb; }

  start(): void {
    if (!this.isSupported()) { this.errorCb?.("La capture audio n'est pas supportée par ce navigateur."); return; }
    if (this.recorder) return;
    this.bufferedBlobs = [];

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } as any })
      .then((stream) => {
        this.mediaStream = stream;
        let options: MediaRecorderOptions | undefined = undefined;
        const preferred = ['audio/webm;codecs=opus', 'audio/webm'];
        for (const mt of preferred) {
          try { if ((window as any).MediaRecorder?.isTypeSupported?.(mt)) { options = { mimeType: mt }; break; } } catch {}
        }
        this.recorder = new MediaRecorder(stream, options);
        this.recorder.ondataavailable = (ev: BlobEvent) => {
          const blob = ev.data; if (!blob || blob.size === 0) return;
          if (this.deferUpload) { this.bufferedBlobs.push(blob); return; }
          if (blob.size < this.minSliceBytes) { this.streamBufferBlobs.push(blob); this.streamBufferBytes += blob.size; return; }
          if (this.streamBufferBytes > 0) {
            this.streamBufferBlobs.push(blob); this.streamBufferBytes += blob.size;
            const reachedBytes = this.streamBufferBytes >= this.coalesceTargetBytes;
            const reachedSlices = this.streamBufferBlobs.length >= this.coalesceMinSlices;
            if (reachedBytes || reachedSlices) {
              const merged = new Blob(this.streamBufferBlobs, { type: this.streamBufferBlobs[0].type });
              this.streamBufferBlobs = []; this.streamBufferBytes = 0; this.pendingQueue.push(merged); void this.drainQueue();
            }
            return;
          }
          this.pendingQueue.push(blob); void this.drainQueue();
        };
        this.recorder.onerror = () => { this.errorCb?.("Erreur d'enregistrement audio."); };
        if (this.deferUpload) {
          this.recorder.onstop = () => {
            // Merge any buffered and stream-buffered slices into one final blob
            const parts = [...this.streamBufferBlobs, ...this.bufferedBlobs];
            if (parts.length > 0) {
              const finalBlob = new Blob(parts, { type: (parts[0] as any)?.type || this.bufferedBlobs[0]?.type || 'audio/webm' });
              this.streamBufferBlobs = [];
              this.streamBufferBytes = 0;
              this.bufferedBlobs = [];
              void this.uploadChunk(finalBlob);
            }
            // Cleanup after finalize
            if (this.mediaStream) { this.mediaStream.getTracks().forEach((t) => t.stop()); this.mediaStream = null; }
            this.recorder = null;
          };
          // In deferUpload mode, start without timeslice and let final dataavailable hold the full blob
          this.recorder.start();
        } else {
          this.recorder.start(this.sliceMs);
        }
      })
      .catch(() => { this.errorCb?.('Accès au micro refusé ou indisponible.'); });
  }

  stop(): void {
    try { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); } catch {}
    // In deferUpload mode, let onstop flush and cleanup to avoid race conditions
    if (this.deferUpload) { return; }
    // Streaming mode cleanup
    this.bufferedBlobs = [];
    this.streamBufferBlobs = []; this.streamBufferBytes = 0; this.recorder = null;
    if (this.mediaStream) { this.mediaStream.getTracks().forEach((t) => t.stop()); this.mediaStream = null; }
    if (this.abortController) { this.abortController.abort(); this.abortController = null; }
    this.pendingQueue = [];
    this.uploading = false;
  }

  private async drainQueue(): Promise<void> {
    if (this.uploading) return; const next = this.pendingQueue.shift(); if (!next) return; await this.uploadChunk(next); if (this.pendingQueue.length > 0) void this.drainQueue();
  }

  private async uploadChunk(blob: Blob): Promise<void> {
    if (this.uploading) return; this.uploading = true; this.abortController = new AbortController();
    try {
      const file = new File([blob], this.deriveFilename(blob.type), { type: blob.type });
      const form = new FormData(); form.append('file', file);
      const res = await fetch('/api/voice/transcribe', { method: 'POST', body: form, signal: this.abortController.signal });
      if (!res.ok) { const msg = await this.safeErrorMessage(res); throw new Error(msg || `Transcription HTTP ${res.status}`); }
      const data: { text?: string } = await res.json().catch(() => ({})); const text = (data.text || '').trim(); if (text && this.transcriptCb) this.transcriptCb(text);
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') this.errorCb?.('La transcription est indisponible pour le moment.');
    } finally {
      this.uploading = false; this.abortController = null;
    }
  }

  private deriveFilename(mime: string): string {
    const base = (mime || '').split(';')[0];
    const map: Record<string, string> = { 'audio/webm': 'chunk.webm', 'audio/ogg': 'chunk.ogg', 'audio/wav': 'chunk.wav', 'audio/mpeg': 'chunk.mp3', 'audio/mp3': 'chunk.mp3', 'audio/flac': 'chunk.flac' };
    return map[base] || 'chunk.wav';
  }

  private async safeErrorMessage(res: Response): Promise<string | null> {
    try { const data = await res.json(); return data?.detail || null; } catch { return null; }
  }
}
