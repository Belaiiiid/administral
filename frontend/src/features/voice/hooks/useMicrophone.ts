import { useCallback, useEffect, useRef, useState } from "react";

export function useMicrophone(timesliceMs: number = 750) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);

  const cleanup = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.stream) {
      mr.stream.getTracks().forEach((track) => track.stop());
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  };

  const start = useCallback(async () => {
    if (recording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: pickMime() });
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.start(timesliceMs);
    mediaRecorderRef.current = mr;
    setRecording(true);
  }, [recording, timesliceMs]);

  const stop = useCallback(async (): Promise<Blob> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr) return resolve(new Blob());
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        cleanup();
        resolve(blob);
      };
      mr.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    try { mr.stop(); } catch {}
    cleanup();
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { start, stop, cancel, recording } as const;
}

function pickMime(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "audio/webm";
}
