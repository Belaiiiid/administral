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

# Prefer dedicated voice base URL if provided; otherwise default to Mistral's /v1 root
BASE_URL = getattr(settings, "voice_base_url", None) or "https://api.mistral.ai/v1"

# Models (optional overrides)
STT_MODEL = getattr(settings, "voice_stt_model", None) or "voxtral-mini-latest"
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
    converted = maybe_transcode_to_wav(audio_bytes, content_type)
    if converted is not None:
        audio_bytes, content_type = converted

    ext = _mime_to_ext(content_type)
    filename = f"audio.{ext}"

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
