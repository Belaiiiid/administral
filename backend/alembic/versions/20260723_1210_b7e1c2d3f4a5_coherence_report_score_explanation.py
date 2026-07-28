"""coherence report: overall score and AI explanation

Adds the two fields the automatic coherence analysis produces at submission and
that both portals display — kept additive and nullable so existing rows (seed
fixtures) remain valid.

Revision ID: b7e1c2d3f4a5
Revises: 2f9416fc8d75
Create Date: 2026-07-23 12:10:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'b7e1c2d3f4a5'
down_revision: str | None = '2f9416fc8d75'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('coherence_reports', sa.Column('coherence_score', sa.Integer(), nullable=True))
    op.add_column('coherence_reports', sa.Column('ai_explanation', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('coherence_reports', 'ai_explanation')
    op.drop_column('coherence_reports', 'coherence_score')
