import type { SpeechToTextProvider } from '../types';

/**
 * Mistral/Voxtral-backed STT provider.
 *
 * Captures microphone audio with MediaRecorder and uploads time-sliced chunks
 * to the backend proxy: POST /api/voice/transcribe (multipart/form-data).
 *
 * Notes:
 * - Only one upload runs at a time; concurrent chunks are dropped to avoid
 *   overlapping requests and backpressure.
 * - Default slice length ~3s for standby wake-word polling; callers can pass a
 *   longer slice (e.g., 6s) for the command capture window.
 */
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
  private readonly minSliceBytes: number; // default via opts
  private readonly coalesceTargetBytes: number;
  private readonly coalesceMinSlices: number;
  private pendingQueue: Blob[] = []; // FIFO of chunks waiting to upload when a request is in-flight

  constructor(opts?: { sliceMs?: number; deferUpload?: boolean; minSliceBytes?: number; coalesceTargetBytes?: number; coalesceMinSlices?: number }) {
    this.sliceMs = opts?.sliceMs ?? 3000;
    this.deferUpload = !!opts?.deferUpload;
    this.minSliceBytes = opts?.minSliceBytes ?? 20000; // ~20KB — too small → likely partial
    this.coalesceTargetBytes = opts?.coalesceTargetBytes ?? 50000; // ~50KB — merge and upload
    this.coalesceMinSlices = opts?.coalesceMinSlices ?? 3; // Always merge at least 3 slices before upload
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && !!(navigator.mediaDevices && (window as any).MediaRecorder);
  }

  onTranscript(cb: (text: string) => void): void {
    this.transcriptCb = cb;
  }

  onError(cb: (message: string) => void): void {
    this.errorCb = cb;
  }

  start(): void {
    if (!this.isSupported()) {
      this.errorCb?.("La capture audio n'est pas supportée par ce navigateur.");
      return;
    }

    // Prevent double-start
    if (this.recorder) return;

    // Reset buffer at (re)start
    this.bufferedBlobs = [];

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } as any })
      .then((stream) => {
        this.mediaStream = stream;

        // Pin recorder MIME to webm/opus, fallback to webm — avoid mp3/ogg/wav containers
        let options: MediaRecorderOptions | undefined = undefined;
        const preferred = ['audio/webm;codecs=opus', 'audio/webm'];
        for (const mt of preferred) {
          try {
            if ((window as any).MediaRecorder && (window as any).MediaRecorder.isTypeSupported?.(mt)) {
              options = { mimeType: mt };
              break;
            }
          } catch (_) {
            // ignore and fall back
          }
        }

        this.recorder = new MediaRecorder(stream, options);
        this.recorder.ondataavailable = (ev: BlobEvent) => {
          const blob = ev.data;
          if (!blob || blob.size === 0) return;

          if (this.deferUpload) {
            // One final upload on stop()
            this.bufferedBlobs.push(blob);
            return;
          }

          // Streaming mode: drop tiny partial slices and coalesce consecutive slices
          if (blob.size < this.minSliceBytes) {
            // Buffer small slice until we have enough bytes
            this.streamBufferBlobs.push(blob);
            this.streamBufferBytes += blob.size;
            return;
          }

          // If we have small buffered pieces, merge them with this slice
          if (this.streamBufferBytes > 0) {
            this.streamBufferBlobs.push(blob);
            this.streamBufferBytes += blob.size;

            const reachedBytes = this.streamBufferBytes >= this.coalesceTargetBytes;
            const reachedSlices = this.streamBufferBlobs.length >= this.coalesceMinSlices;
            if (reachedBytes || reachedSlices) {
              const merged = new Blob(this.streamBufferBlobs, { type: this.streamBufferBlobs[0].type });
              this.streamBufferBlobs = [];
              this.streamBufferBytes = 0;
              this.pendingQueue.push(merged);
              void this.drainQueue();
            }
            return;
          }

          // Normal-sized slice: enqueue for upload; uploader drains sequentially
          this.pendingQueue.push(blob);
          void this.drainQueue();
        };
        this.recorder.onerror = () => {
          this.errorCb?.("Erreur d'enregistrement audio.");
        };
        if (this.deferUpload) {
          // Single final blob: dataavailable will fire once just before 'stop'
          this.recorder.onstop = () => {
            if (this.bufferedBlobs.length > 0) {
              const finalBlob = new Blob(this.bufferedBlobs, { type: this.bufferedBlobs[0].type });
              this.bufferedBlobs = [];
              void this.uploadChunk(finalBlob);
            }
          };
          this.recorder.start(); // no timeslice -> one final blob
        } else {
          this.recorder.start(this.sliceMs);
        }
      })
      .catch((err) => {
        console.error('getUserMedia error', err);
        this.errorCb?.("Accès au micro refusé ou indisponible.");
      });
  }

  stop(): void {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop();
      }
    } catch (_) {
      // ignore
    }

    // If deferring, flush a single final chunk composed from all buffered blobs
    if (this.deferUpload && this.bufferedBlobs.length > 0) {
      const finalBlob = new Blob(this.bufferedBlobs, { type: this.bufferedBlobs[0].type });
      this.bufferedBlobs = [];
      this.pendingQueue.push(finalBlob);
      void this.drainQueue();
    } else {
      this.bufferedBlobs = [];
    }

    // Clear streaming buffers
    this.streamBufferBlobs = [];
    this.streamBufferBytes = 0;

    this.recorder = null;

    // Abort any in-flight upload and drop pending queue
    this.pendingQueue = [];

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.uploading = false;
  }

  private async drainQueue(): Promise<void> {
    if (this.uploading) return;
    const next = this.pendingQueue.shift();
    if (!next) return;
    await this.uploadChunk(next);
    // Drain next item sequentially after the previous upload completes
    if (this.pendingQueue.length > 0) void this.drainQueue();
  }

  private async uploadChunk(blob: Blob): Promise<void> {
    if (this.uploading) return; // drop if a previous upload is in-flight
    this.uploading = true;

    this.abortController = new AbortController();
    try {
      const file = new File([blob], this.deriveFilename(blob.type), { type: blob.type });
      const form = new FormData();
      form.append('file', file);

      const res = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: form,
        signal: this.abortController.signal,
      });

      if (!res.ok) {
        const msg = await this.safeErrorMessage(res);
        throw new Error(msg || `Transcription HTTP ${res.status}`);
      }

      const data: { text?: string } = await res.json().catch(() => ({}));
      const text = (data.text || '').trim();
      if (text && this.transcriptCb) {
        this.transcriptCb(text);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // normal during stop()
      } else {
        console.error('STT upload error', err);
        this.errorCb?.('La transcription est indisponible pour le moment.');
      }
    } finally {
      this.uploading = false;
      this.abortController = null;
    }
  }

  private deriveFilename(mime: string): string {
    const base = (mime || '').split(';')[0];
    const map: Record<string, string> = {
      'audio/webm': 'chunk.webm',
      'audio/ogg': 'chunk.ogg',
      'audio/wav': 'chunk.wav',
      'audio/mpeg': 'chunk.mp3',
      'audio/mp3': 'chunk.mp3',
      'audio/flac': 'chunk.flac',
    };
    return map[base] || 'chunk.wav';
  }

  private async safeErrorMessage(res: Response): Promise<string | null> {
    try {
      const data = await res.json();
      return data?.detail || null;
    } catch {
      return null;
    }
  }
}
