from pydantic import BaseModel, Field


class TranscribeResponse(BaseModel):
    """Text returned by the STT transcription proxy."""
    text: str


class SpeakRequest(BaseModel):
    """Request body for the TTS proxy endpoint."""
    text: str = Field(..., min_length=1, max_length=2000)


class VoiceErrorResponse(BaseModel):
    """Structured error payload returned when the upstream voice service is unavailable."""
    detail: str
    code: str


# ---------- Classifier (NLC) ----------
class ClassifyRequest(BaseModel):
    transcript: str
    actions: list[str] = []
    fields: list[str] = []


class ClassifyResponse(BaseModel):
    # navigate|read_page|stop_speaking|explain_actions|fill_field|reply|unknown
    type: str
    target: str | None = None
    value: str | None = None
    reply: str | None = None
