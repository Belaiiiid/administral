"""Application configuration.

Every environment variable enters the application here and nowhere else. A
missing or malformed value fails at import time with a message naming it,
rather than surfacing later as an undefined connection string somewhere in a
repository.

No credential has a default. A backend that silently falls back to
``postgres/postgres`` is a backend that connects to the wrong database in an
environment where someone forgot to set it.
"""

from __future__ import annotations

from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings read from ``backend/.env`` and the process environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # -- Database ----------------------------------------------------------
    database_host: str = "localhost"
    database_port: int = 5432
    database_name: str = "monparcours"
    database_user: str
    database_password: str

    # Escape hatch for connections the parts above cannot express.
    database_url_override: str | None = Field(default=None, alias="DATABASE_URL")

    # -- Application -------------------------------------------------------
    app_env: str = "development"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173"

    # -- Authentication ----------------------------------------------------
    # HS256 JWTs. The secret MUST be overridden in any shared environment — the
    # default is a placeholder that would let anyone forge a token.
    jwt_secret_key: str = "dev-only-change-me-with-a-32-plus-char-random-secret"
    jwt_algorithm: str = "HS256"
    # Deliberately short-lived (the feature's defining trait). No refresh token
    # yet, so a re-login is needed after expiry — acceptable for the two-role
    # foundation this establishes.
    access_token_expire_minutes: int = 30

    # -- Account tokens (email verification / password reset) --------------
    # Deliberately different lifetimes. A verification link is a convenience and
    # can be re-sent freely, so it lives long enough to survive a spam folder. A
    # reset link is an account-takeover primitive, so it expires fast.
    email_verification_token_ttl_hours: int = 48
    password_reset_token_ttl_minutes: int = 60

    # -- Email delivery ----------------------------------------------------
    # `console` writes the message to the log instead of sending it — the
    # default, so local development needs no SMTP server and no secrets. It is a
    # real backend behind the same interface as SMTP, not a stub: switching to
    # production delivery is `EMAIL_BACKEND=smtp` plus the SMTP_* values below,
    # with no code change (see app/core/email.py).
    email_backend: str = "console"
    email_from: str = "MonParcours <ne-pas-repondre@monparcours.fr>"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True

    # Where the links in those emails point — the frontend, not the API. Only
    # the frontend knows how to render /verifier-email or /reinitialiser.
    frontend_base_url: str = "http://localhost:5173"

    # -- AI / Mistral ------------------------------------------------------
    # Optional on purpose. Absent, the coherence analyser degrades to
    # `a_revoir` rather than declaring a dossier coherent unverified — an
    # unset key must never become a silent "everything is fine". The
    # frontend never sees any of these values.
    mistral_api_key: str | None = None
    mistral_model: str = "mistral-medium-latest"
    mistral_api_url: str = "https://api.mistral.ai/v1/chat/completions"
    # Distinct models per task, matching the Squad_B backend: a small model is
    # enough to classify one already-extracted document, while OCR uses the
    # dedicated OCR model.
    mistral_classifier_model: str = "mistral-small-latest"
    mistral_ocr_model: str = "mistral-ocr-latest"
    mistral_ocr_url: str = "https://api.mistral.ai/v1/ocr"
    # Forensic (C4) analysis benefits from a stronger model — subtle metadata
    # inconsistencies are a reasoning task, not a classification one.
    mistral_fraud_model: str = "mistral-large-latest"
    # Profiling (citizen.profiling): this project talks to the Mistral API only,
    # so the deterministic rule generator is OFF by default — every profiling
    # turn must call Mistral, and a missing key surfaces as an error rather than
    # a silent rule-based answer. Set `MISTRAL_ALLOW_FALLBACK=true` only to run
    # the assistant offline (local dev without a key, tests).
    mistral_allow_fallback: bool = False

    # -- France Travail — Offres d'emploi API (ai.job_search) --------------
    # Optional on purpose, like the Mistral key: absent, job search degrades
    # to `available: false` rather than inventing job listings.
    france_travail_client_id: str | None = None
    france_travail_client_secret: str | None = None

    # -- Document storage --------------------------------------------------
    # Where uploaded files are written. Local filesystem for development; a
    # deployment swaps this for object storage behind the same repository
    # interface. Only metadata lives in PostgreSQL — never the file bytes.
    upload_dir: str = "uploads"
    # Reject anything larger, before reading it into memory. 10 MB matches the
    # limit the upload UI advertises.
    max_upload_bytes: int = 10 * 1024 * 1024

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        """SQLAlchemy connection URL.

        Assembled from the parts rather than stored whole, so the password
        lives in exactly one variable. ``quote_plus`` is applied because a
        password containing ``@``, ``:`` or ``/`` would otherwise be parsed as
        URL structure and produce a baffling connection error.
        """
        if self.database_url_override:
            return self.database_url_override

        user = quote_plus(self.database_user)
        password = quote_plus(self.database_password)

        return (
            f"postgresql+psycopg2://{user}:{password}"
            f"@{self.database_host}:{self.database_port}/{self.database_name}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origin_list(self) -> list[str]:
        """Explicit origins rather than ``*``: the API will carry credentials,
        and a wildcard origin cannot."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


@lru_cache
def get_settings() -> Settings:
    """Cached accessor.

    ``lru_cache`` makes this a singleton: the ``.env`` file is read once per
    process, and every caller sees the same object. It is also what lets tests
    override configuration via ``get_settings.cache_clear()``.
    """
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
