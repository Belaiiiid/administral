import { useEffect, useRef, useState } from "react";
import { useMicrophone } from "../hooks/useMicrophone";
import { speakText, transcribeAudio } from "../api/voiceApi";

export function VoiceButton() {
  const { start, stop, recording } = useMicrophone();
  const [transcript, setTranscript] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => URL.revokeObjectURL(audioRef.current?.src || ""), []);

  const onPress = async () => {
    setError(null);
    setTranscript("");
    await start();
  };

  const onRelease = async () => {
    try {
      const blob = await stop();
      if (!blob || blob.size === 0) return;
      const { text } = await transcribeAudio(blob);
      setTranscript(text);
      // Optional echo via TTS of the transcript (simple demo behavior)
      if (text && text.trim().length) {
        const { url } = await speakText(text);
        if (audioRef.current) {
          audioRef.current.src = url;
          await audioRef.current.play().catch(() => {});
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Erreur microphone");
    }
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        aria-pressed={recording}
        onMouseDown={onPress}
        onMouseUp={onRelease}
        onTouchStart={(e) => { e.preventDefault(); onPress(); }}
        onTouchEnd={(e) => { e.preventDefault(); onRelease(); }}
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: recording ? "#ef4444" : "#2563eb",
          color: "white",
          border: 0,
        }}
        title={recording ? "Relâcher pour envoyer" : "Appuyer pour parler"}
      >
        {recording ? "●" : "🎤"}
      </button>
      <audio ref={audioRef} hidden />
      {transcript && (
        <div style={{ fontSize: 12, color: "#111827", maxWidth: 320 }}>{transcript}</div>
      )}
      {error && (
        <div role="alert" style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div>
      )}
    </div>
  );
}
