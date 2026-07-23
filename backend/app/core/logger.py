"""Minimal structured logger.

Dependency-free on purpose. A logging library is a reasonable thing to add once
there is somewhere to ship logs to; adding one before that requirement is known
is a dependency chosen too early. Swap the implementation here and every call
site follows — nothing imports a logging library directly.
"""

from __future__ import annotations

import json
import sys
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


logger = _Logger()
