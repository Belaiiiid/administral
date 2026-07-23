"""Placeholder — the `apl` module has no implementation yet.

Structure intentionally left empty rather than pre-filled with stub files. An
empty router that returns 501, or a repository with no queries, is code that
must be read and deleted before the real thing can be written.

When this slice is built it follows the same layout as `modules/agent`:

    router.py      HTTP only — receives requests, returns responses
    service.py     business logic and rules
    repository.py  database queries only
    models.py      SQLAlchemy entities
    schemas.py     Pydantic request/response objects

Then register it in `app/main.py` and import its models in
`app/database/models.py` — Alembic autogenerate will not see them otherwise.
"""
