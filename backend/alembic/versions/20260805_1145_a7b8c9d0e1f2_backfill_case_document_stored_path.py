"""Backfill case_documents.stored_path from the citizen upload it came from

`f1a2b3c4d5e6` added the column but only new submissions populate it, so every
dossier already in the queue stayed unopenable — the file was on disk, the case
row just had no way to name it.

The link is reconstructible: a case's `application_number` is `APL-{application_id}`
(see `citizen/submission.py`), and within one application a file name identifies
the upload. That is enough to reconnect the two rows.

Documents with no counterpart in `application_documents` — the seeded fixture
cases, which never had files — keep NULL. That is the honest outcome: the agent
portal then says the piece was never attached rather than showing an empty frame.

Idempotent (`WHERE stored_path IS NULL`) and reversible only in the sense that
`f1a2b3c4d5e6`'s downgrade drops the column; there is nothing to undo here, so
`downgrade` is a no-op rather than a destructive NULL-out.

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-08-05 11:45:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'a7b8c9d0e1f2'
down_revision: str | None = 'f1a2b3c4d5e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE case_documents AS cd
               SET stored_path = ad.stored_path
              FROM cases AS c, application_documents AS ad
             WHERE cd.case_id = c.id
               AND c.application_number = 'APL-' || ad.application_id
               AND cd.file_name = ad.file_name
               AND cd.stored_path IS NULL
               AND ad.stored_path IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    """No-op: clearing the paths again would only re-break the agent viewer."""
