"""case_documents.stored_path — let an agent open the actual file

Adds the link from a case document back to the bytes uploaded by the citizen.
Before this, a case carried a file *name* but nothing that could resolve to the
file, so the agent portal could only list documents, never show them.

Nullable: cases submitted before this migration, and seeded ones, keep NULL and
the agent endpoint answers 404 for them.

Revision ID: f1a2b3c4d5e6
Revises: e72ec282848c
Create Date: 2026-08-05 10:30:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'f1a2b3c4d5e6'
down_revision: str | None = 'e72ec282848c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'case_documents',
        sa.Column('stored_path', sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('case_documents', 'stored_path')
