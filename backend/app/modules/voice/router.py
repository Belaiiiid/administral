"""
Voice proxy routes — STT and TTS via a vendor-agnostic voice service.

POST /api/voice/transcribe  — audio file → transcribed text
POST /api/voice/speak       — text → WAV audio bytes
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response

from app.modules.voice.schemas import SpeakRequest, TranscribeResponse, ClassifyRequest, ClassifyResponse
from app.modules.voice import service as voice_service
from app.modules.voice.service import VoiceAPIError

router = APIRouter(prefix="/voice", tags=["voice"])

# Maximum audio payload accepted (10 MB). Guards against accidental large uploads.
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(file: UploadFile = File(...)) -> TranscribeResponse:
    """
    Receive a raw audio file from the frontend, proxy it to the voice
    service /v1/audio/transcriptions, and return the transcribed text.

    On upstream failure, returns HTTP 502 with a user-facing message so
    the frontend can trigger the large-button fallback.
    """
    audio_bytes = await file.read()

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large (max 10 MB).")

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty.")

    try:
        text = await voice_service.transcribe(
            audio_bytes=audio_bytes,
            content_type=file.content_type or "audio/wav",
        )
    except VoiceAPIError as exc:
        # Propagate vendor rate limits; otherwise map to 502
        status = 429 if getattr(exc, 'status_code', 0) == 429 else 502
        raise HTTPException(
            status_code=status,
            detail=f"Service de transcription indisponible : {exc.detail}",
        )

    return TranscribeResponse(text=text)


@router.post("/speak")
async def speak(body: SpeakRequest) -> Response:
    """
    Receive a text string from the frontend, proxy it to the voice service
    /v1/audio/speech, and return raw WAV bytes.

    On upstream failure, returns HTTP 502 so the frontend can skip
    speech and fall back to silent visual-only mode.
    """
    try:
        wav_bytes = await voice_service.speak(text=body.text)
    except VoiceAPIError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Service de synthèse vocale indisponible : {exc.detail}",
        )

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/classify", response_model=ClassifyResponse)
async def classify(body: ClassifyRequest) -> ClassifyResponse:
    """Fallback natural-language classification using a vendor-agnostic service.

    This endpoint is optional; enable with VOICE_NLC_ENABLED=true and provider envs.
    """
    try:
        from app.modules.voice import nlc_service  # optional
    except Exception:
        return ClassifyResponse(type="unknown")

    try:
        result = await nlc_service.classify(body)
        return result
    except Exception:
        # Never crash the app on NLC errors — just return unknown
        return ClassifyResponse(type="unknown")
