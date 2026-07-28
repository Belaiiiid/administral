"""Wire contracts for the settings endpoints. camelCase, PATCH semantics."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _Base(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class UserSettingsResponse(_Base):
    email_notifications: bool
    ai_assistance: bool
    cross_administration_sharing: bool


class UserSettingsUpdate(_Base):
    """A partial edit. Every field optional — only the keys sent are changed."""

    email_notifications: bool | None = None
    ai_assistance: bool | None = None
    cross_administration_sharing: bool | None = None
