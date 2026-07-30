"""
Voice service — proxy between FastAPI endpoints and a vendor-agnostic Voice API.

Secrets live in backend/.env via app.core.config.Settings; never forward them to the client.
"""
from __future__ import annotations

import base64
import os
import shutil
import subprocess

import httpx

from app.core.config import settings

# Vendor selection: 'mistral' (default) or 'whisper'
VOICE_VENDOR = getattr(settings, "voice_vendor", None) or os.getenv("VOICE_VENDOR", "mistral").lower()

# Prefer dedicated voice base URL if provided; otherwise default to Mistral's /v1 root
BASE_URL = getattr(settings, "voice_base_url", None) or "https://api.mistral.ai/v1"

# Models (optional overrides)
STT_MODEL = getattr(settings, "voice_stt_model", None) or ("whisper-1" if VOICE_VENDOR == "whisper" else "voxtral-mini-latest")
TTS_MODEL = getattr(settings, "voice_tts_model", None) or "voxtral-mini-tts-latest"
TTS_VOICE_ID = getattr(settings, "voice_tts_voice", None) or "fr_marie_neutral"


class VoiceAPIError(Exception):
    """Raised when the Voice API returns an error response."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# Back-compat alias name that avoids vendor terms in imports elsewhere
VENDOR_API_ERROR = VoiceAPIError
MistralAPIError = VENDOR_API_ERROR  # for test compatibility if referenced


async def transcribe(audio_bytes: bytes, content_type: str = "audio/wav") -> str:
    """Send raw audio bytes to /v1/audio/transcriptions and return the transcribed text."""
    # Debug: print active vendor and model once per request
    print(f"[voice] vendor={VOICE_VENDOR} stt_model={STT_MODEL}")
    # Log pre-transcode info
    try:
        print(f"[voice] pre: ct={content_type} bytes={len(audio_bytes)}")
    except Exception:
        pass

    # Try to normalize first; some tiny webm chunks expand after transcode
    # For Whisper, skip transcode and send original (webm/ogg/opus supported)
    if VOICE_VENDOR != "whisper":
        converted = maybe_transcode_to_wav(audio_bytes, content_type)
        if converted is not None:
            audio_bytes, content_type = converted

    # Log post-transcode info
    try:
        print(f"[voice] post: ct={content_type} bytes={len(audio_bytes)}")
    except Exception:
        pass

    # Size floor: treat sub-0.1s as silence to avoid upstream 400
    if not audio_bytes:
        raise VoiceAPIError(400, "Audio chunk too small or empty.")
    if len(audio_bytes) < 6000:
        return ""

    ext = _mime_to_ext(content_type)
    filename = f"audio.{ext}"

    if VOICE_VENDOR == "whisper":
        api_key = getattr(settings, "openai_api_key", None) or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise VoiceAPIError(503, "Whisper API key not configured")
        # OpenAI transcription endpoint
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={
                    "file": (filename, audio_bytes, content_type),
                },
                data={
                    "model": STT_MODEL,  # e.g., whisper-1 or large-v3-turbo when available
                    "language": "fr",
                    # force single-channel 16k mono wav is already done above when needed
                },
            )
    else:
        api_key = getattr(settings, "voice_api_key", None) or getattr(settings, "mistral_api_key", None)
        if not BASE_URL or not api_key:
            raise VoiceAPIError(503, "Voice API not configured")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{BASE_URL}/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (filename, audio_bytes, content_type)},
                data={"model": STT_MODEL, "language": "fr"},
            )

    if response.status_code != 200:
        _raise_voice_error(response)

    payload = response.json()
    # OpenAI returns { text: "..." }. Keep behavior identical across vendors
    return payload.get("text", "")


async def speak(text: str) -> bytes:
    """Send text to /v1/audio/speech and return decoded WAV bytes."""
    api_key = getattr(settings, "voice_api_key", None) or getattr(settings, "mistral_api_key", None)
    if not BASE_URL or not api_key:
        raise VoiceAPIError(503, "Voice API not configured")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{BASE_URL}/audio/speech",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": TTS_MODEL,
                "input": text,
                "voice_id": TTS_VOICE_ID,
                "response_format": "wav",
            },
        )

    if response.status_code != 200:
        _raise_voice_error(response)

    payload = response.json()
    audio_b64: str = payload.get("audio_data", "")
    return base64.b64decode(audio_b64)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def maybe_transcode_to_wav(audio_bytes: bytes, content_type: str) -> tuple[bytes, str] | None:
    base = (content_type or "").split(";")[0].lower()
    if base in {"audio/wav", "audio/wave", "audio/x-wav"}:
        return None
    if base not in {"audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/flac", "audio/mp4"}:
        return None
    if shutil.which("ffmpeg") is None:
        return None

    import tempfile

    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, "in.bin")
        dst = os.path.join(td, "out.wav")
        with open(src, "wb") as f:
            f.write(audio_bytes)
        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    src,
                    "-af",
                    "silenceremove=start_periods=1:start_threshold=-45dB:detection=peak",
                    "-ar",
                    "16000",
                    "-ac",
                    "1",
                    "-f",
                    "wav",
                    dst,
                ],
                check=True,
            )
            with open(dst, "rb") as f:
                return (f.read(), "audio/wav")
        except Exception:
            return None


def _mime_to_ext(content_type: str) -> str:
    mapping = {
        "audio/wav": "wav",
        "audio/wave": "wav",
        "audio/x-wav": "wav",
        "audio/webm": "webm",
        "audio/ogg": "ogg",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/flac": "flac",
        "audio/mp4": "mp4",
    }
    base = content_type.split(";")[0].strip().lower()
    return mapping.get(base, "wav")


def _raise_voice_error(response: httpx.Response) -> None:
    try:
        body = response.text
    except Exception:
        body = "<no body>"
    try:
        path = response.request.url.path
    except Exception:
        path = "<no-path>"
    snippet = (body or "")[:200].replace("\n", " ")
    print(f"[voice] upstream {response.status_code} {path} — {snippet}")

    try:
        detail = response.json().get("message", body)
    except Exception:
        detail = body or "Unknown voice API error"
    raise VoiceAPIError(status_code=response.status_code, detail=detail)
