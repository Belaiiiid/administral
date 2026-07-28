export async function transcribeAudio(blob: Blob): Promise<{ text: string }> {
  const fd = new FormData();
  // Default to WAV; backend will transcode if needed
  const file = new File([blob], "audio.webm", { type: blob.type || "audio/webm" });
  fd.append("file", file);

  const res = await fetch("/api/voice/transcribe", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const detail = await safeDetail(res);
    throw new Error(detail || `Transcription failed (${res.status})`);
  }
  return res.json();
}

export async function speakText(text: string): Promise<{ url: string; blob: Blob }> {
  const res = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const detail = await safeDetail(res);
    throw new Error(detail || `TTS failed (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  return { url, blob };
}

async function safeDetail(res: Response): Promise<string | null> {
  try {
    const j = await res.json();
    return (j && (j.detail || j.message)) ?? null;
  } catch {
    return null;
  }
}
