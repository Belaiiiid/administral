"""citizens user_id fk and living profile

Links `citizens` to `users` with a real foreign key, replacing the e-mail string
match that previously reconciled them, and gives the applicant record somewhere
to keep the profiling answers.

Also drops the NOT NULL on `birth_date` and `social_security_number`. Those
columns were filled with placeholders (1990-01-01 and a fifteen-zero NIR) for
citizens who had not declared them, which an agent reading the case could not
tell apart from declared values. Nullable columns let absent read as absent.

Revision ID: addab1d95edd
Revises: b5045295d36c
Create Date: 2026-07-24 12:03:42.012299
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'addab1d95edd'
down_revision: str | None = 'b5045295d36c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Named explicitly rather than left to PostgreSQL: autogenerate emits
# `drop_constraint(None, ...)` in the downgrade, which cannot execute.
_FK_NAME = "fk_citizens_user_id_users"
_UQ_NAME = "uq_citizens_user_id"

#: The placeholders the application used to write. Cleared on upgrade so no row
#: keeps asserting a birth date or NIR nobody supplied.
_PLACEHOLDER_BIRTH_DATE = "1990-01-01"
_PLACEHOLDER_NIR = "000000000000000"


def upgrade() -> None:
    op.add_column('citizens', sa.Column('user_id', sa.Integer(), nullable=True))
    op.add_column(
        'citizens',
        sa.Column('profile_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        'citizens', sa.Column('profile_updated_at', sa.DateTime(timezone=True), nullable=True)
    )

    op.alter_column('citizens', 'birth_date', existing_type=sa.DATE(), nullable=True)
    op.alter_column(
        'citizens', 'social_security_number', existing_type=sa.VARCHAR(length=32), nullable=True
    )

    op.create_unique_constraint(_UQ_NAME, 'citizens', ['user_id'])
    op.create_foreign_key(_FK_NAME, 'citizens', 'users', ['user_id'], ['id'], ondelete='SET NULL')

    # Backfill the new link using the rule the application used until now, so
    # existing applicants stay attached to their account instead of appearing as
    # orphans the moment the code stops matching on e-mail.
    #
    # `lower(trim(...))` because that match was exact and case-sensitive: rows
    # differing only in case were already two identities to the old code, and
    # this is the one chance to reunite them. The unique constraint on user_id
    # means a genuine duplicate aborts the migration rather than silently
    # picking one — the correct outcome, since it needs a human decision.
    op.execute(
        sa.text(
            """
            UPDATE citizens c
               SET user_id = u.id
              FROM users u
             WHERE lower(trim(c.email)) = lower(trim(u.email))
               AND c.user_id IS NULL
            """
        )
    )

    op.execute(
        sa.text("UPDATE citizens SET birth_date = NULL WHERE birth_date = :placeholder").bindparams(
            placeholder=_PLACEHOLDER_BIRTH_DATE
        )
    )
    op.execute(
        sa.text(
            "UPDATE citizens SET social_security_number = NULL "
            "WHERE social_security_number = :placeholder"
        ).bindparams(placeholder=_PLACEHOLDER_NIR)
    )


def downgrade() -> None:
    op.drop_constraint(_FK_NAME, 'citizens', type_='foreignkey')
    op.drop_constraint(_UQ_NAME, 'citizens', type_='unique')

    # The columns become NOT NULL again below, so every row needs a value.
    # Restore the placeholders this migration removed — reinstating the old
    # schema means reinstating the fiction it required.
    op.execute(
        sa.text(
            "UPDATE citizens SET birth_date = :placeholder WHERE birth_date IS NULL"
        ).bindparams(placeholder=_PLACEHOLDER_BIRTH_DATE)
    )
    op.execute(
        sa.text(
            "UPDATE citizens SET social_security_number = :placeholder "
            "WHERE social_security_number IS NULL"
        ).bindparams(placeholder=_PLACEHOLDER_NIR)
    )

    op.alter_column(
        'citizens', 'social_security_number', existing_type=sa.VARCHAR(length=32), nullable=False
    )
    op.alter_column('citizens', 'birth_date', existing_type=sa.DATE(), nullable=False)

    op.drop_column('citizens', 'profile_updated_at')
    op.drop_column('citizens', 'profile_data')
    op.drop_column('citizens', 'user_id')
