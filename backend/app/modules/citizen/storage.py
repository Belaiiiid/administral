"""File storage for uploads.

Local filesystem, behind a two-function interface so a deployment can swap in
object storage without touching the service. Only file *bytes* live here;
metadata lives in PostgreSQL. The two are kept apart on purpose — a database is
the wrong place for blobs, and a filesystem is the wrong place for queryable
metadata.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from app.core.config import settings

# Kept short; the original filename is preserved in the database, not on disk,
# so a stored file cannot collide or carry a path-traversal payload in its name.
_SUFFIX_WHITELIST = {".pdf", ".jpg", ".jpeg", ".png"}


def _root() -> Path:
    root = Path(settings.upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def store(data: bytes, original_name: str) -> str:
    """Write bytes to storage under a generated name. Returns the stored path.

    The on-disk name is a UUID plus a whitelisted suffix — never the client's
    filename, which is untrusted and could contain `../`. The real name travels
    in the database.
    """
    suffix = Path(original_name).suffix.lower()
    if suffix not in _SUFFIX_WHITELIST:
        suffix = ".bin"

    path = _root() / f"{uuid.uuid4()}{suffix}"
    path.write_bytes(data)
    return str(path)


def delete(stored_path: str) -> None:
    """Remove a stored file. Missing is fine — deletion is idempotent."""
    Path(stored_path).unlink(missing_ok=True)
