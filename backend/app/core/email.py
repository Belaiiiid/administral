"""Outbound email — one interface, two backends.

The application never sends mail directly. It calls `send_email()`, which
dispatches to the backend named by ``EMAIL_BACKEND``:

- ``console`` (default) writes the whole message to the structured log. Local
  development therefore needs no SMTP server, no API key and no network — the
  developer copies the verification link out of the terminal.
- ``smtp`` delivers over SMTP with the ``SMTP_*`` settings.

The console backend is a *backend*, not a stub: it implements the same
`EmailBackend` protocol and is selected by configuration. Moving to real
delivery is an environment change, not a rewrite — which is the whole reason
this indirection exists rather than `smtplib` calls scattered through the auth
service.

Failures are raised, never swallowed. A caller that must not fail the request
because of a mail outage (the password-reset request, which has to answer 200
regardless) decides that for itself — this module does not decide it for them.
"""

from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol

from app.core.config import settings
from app.core.logger import logger


@dataclass(frozen=True)
class Email:
    """One message, already rendered. Backends receive nothing else."""

    to: str
    subject: str
    #: Plain text. Every message this application sends is plain text on
    #: purpose: an administrative notice with a link needs no HTML, and HTML
    #: mail is the part that breaks in screen readers and text clients.
    body: str


class EmailBackend(Protocol):
    def send(self, message: Email) -> None: ...


class ConsoleEmailBackend:
    """Writes the message to the log. The default for local development."""

    def send(self, message: Email) -> None:
        logger.info(
            "email (console backend — not delivered)",
            {
                "to": message.to,
                "subject": message.subject,
                "from": settings.email_from,
                "body": message.body,
            },
        )


class SmtpEmailBackend:
    """Delivers over SMTP."""

    def send(self, message: Email) -> None:
        if not settings.smtp_host:
            raise RuntimeError(
                "EMAIL_BACKEND=smtp mais SMTP_HOST n'est pas défini. "
                "Configurer SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD, "
                "ou repasser à EMAIL_BACKEND=console."
            )

        payload = EmailMessage()
        payload["From"] = settings.email_from
        payload["To"] = message.to
        payload["Subject"] = message.subject
        payload.set_content(message.body)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as client:
            if settings.smtp_use_tls:
                client.starttls()
            if settings.smtp_user and settings.smtp_password:
                client.login(settings.smtp_user, settings.smtp_password)
            client.send_message(payload)

        logger.info("email sent", {"to": message.to, "subject": message.subject})


_BACKENDS: dict[str, type[ConsoleEmailBackend | SmtpEmailBackend]] = {
    "console": ConsoleEmailBackend,
    "smtp": SmtpEmailBackend,
}


def get_email_backend() -> EmailBackend:
    """Resolve the configured backend.

    An unknown name fails loudly rather than falling back to console: silently
    logging password-reset links instead of sending them, in an environment
    where someone typo'd the value, is the failure mode worth preventing.
    """
    try:
        return _BACKENDS[settings.email_backend.lower()]()
    except KeyError:
        raise RuntimeError(
            f"EMAIL_BACKEND inconnu : {settings.email_backend!r}. "
            f"Valeurs acceptées : {', '.join(sorted(_BACKENDS))}."
        ) from None


def send_email(message: Email) -> None:
    get_email_backend().send(message)
