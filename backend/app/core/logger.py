"""Minimal structured logger.

Dependency-free on purpose. A logging library is a reasonable thing to add once
there is somewhere to ship logs to; adding one before that requirement is known
is a dependency chosen too early. Swap the implementation here and every call
site follows — nothing imports a logging library directly.
"""

from __future__ import annotations

import json
import sys
import traceback
from datetime import UTC, datetime
from typing import Any


def _emit(level: str, message: str, context: dict[str, Any] | None) -> None:
    line = {
        "timestamp": datetime.now(UTC).isoformat(),
        "level": level,
        "message": message,
    }
    if context:
        line["context"] = context

    stream = sys.stderr if level in {"warn", "error"} else sys.stdout
    print(json.dumps(line, ensure_ascii=False), file=stream)


class _Logger:
    def info(self, message: str, context: dict[str, Any] | None = None) -> None:
        _emit("info", message, context)

    def warn(self, message: str, context: dict[str, Any] | None = None) -> None:
        _emit("warn", message, context)

    def error(self, message: str, context: dict[str, Any] | None = None) -> None:
        _emit("error", message, context)

    def exception(self, message: str, context: dict[str, Any] | None = None) -> None:
        """Une erreur AVEC la trace de l'exception en cours de traitement.

        À appeler depuis un bloc `except`. C'est ce qui manquait pour qu'un
        `except Exception` puisse être à la fois silencieux pour le citoyen et
        exploitable pour l'équipe : sans la trace, « une erreur est survenue » ne
        dit pas où, et l'incident reste aussi opaque que s'il n'avait rien écrit.

        Le type et le message de l'exception sont sortis dans leurs propres
        champs : c'est sur eux qu'on regroupe et qu'on compte des incidents, la
        trace complète servant ensuite à comprendre un cas précis.

        Hors d'un bloc `except`, se comporte simplement comme `error`.
        """
        exc_type, exc, _ = sys.exc_info()
        details = dict(context or {})
        if exc is not None:
            details["error"] = f"{exc_type.__name__}: {exc}"
            details["traceback"] = traceback.format_exc()
        _emit("error", message, details)


logger = _Logger()
