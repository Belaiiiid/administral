"""The two transactional emails the auth module sends.

Rendering lives here rather than inline in `service.py` so the wording — the
part a non-developer reviews — is readable without reading the flow logic, and
so both messages share one place to get the link construction right.

The links point at the **frontend**, not the API: a citizen clicking a link in
their mail client must land on a page, not a JSON response. The frontend page
then posts the token back to the API.
"""

from __future__ import annotations

from urllib.parse import quote, urlencode

from app.core.config import settings
from app.core.email import Email

#: Frontend routes that redeem a token. Mirrors `frontend/src/app/router/paths.ts`.
_VERIFY_PATH = "/verifier-email"
_RESET_PATH = "/reinitialiser-mot-de-passe"


def _link(path: str, token: str) -> str:
    base = settings.frontend_base_url.rstrip("/")
    return f"{base}{path}?{urlencode({'token': token}, quote_via=quote)}"


def verification_email(*, to: str, first_name: str, token: str) -> Email:
    link = _link(_VERIFY_PATH, token)
    hours = settings.email_verification_token_ttl_hours

    return Email(
        to=to,
        subject="Confirmez votre adresse e-mail — Ad'Ministral",
        body=(
            f"Bonjour {first_name},\n\n"
            "Votre compte Ad'Ministral a bien été créé. Pour confirmer que cette "
            "adresse e-mail vous appartient, ouvrez le lien ci-dessous :\n\n"
            f"{link}\n\n"
            f"Ce lien est valable {hours} heures. Passé ce délai, vous pourrez en "
            "demander un nouveau depuis votre espace personnel.\n\n"
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : "
            "aucun compte ne sera activé sans cette confirmation.\n\n"
            "— L'équipe Ad'Ministral\n"
        ),
    )


def password_reset_email(*, to: str, first_name: str, token: str) -> Email:
    link = _link(_RESET_PATH, token)
    minutes = settings.password_reset_token_ttl_minutes

    return Email(
        to=to,
        subject="Réinitialisation de votre mot de passe — Ad'Ministral",
        body=(
            f"Bonjour {first_name},\n\n"
            "Vous avez demandé à réinitialiser le mot de passe de votre compte "
            "Ad'Ministral. Choisissez un nouveau mot de passe ici :\n\n"
            f"{link}\n\n"
            f"Ce lien est valable {minutes} minutes et ne peut servir qu'une seule fois.\n\n"
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message. "
            "Votre mot de passe actuel reste valable et personne n'a accès à votre compte.\n\n"
            "— L'équipe Ad'Ministral\n"
        ),
    )
