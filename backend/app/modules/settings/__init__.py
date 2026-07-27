"""Per-account settings.

One row per user, created on first read. Holds the preferences a person sets for
themselves — notification delivery, assistant availability, data-sharing consent.
Role decides which of these the UI exposes, but the store is one table keyed on
``user_id`` (see [[civique-platform-demo]] for the wider Task 6 shape).
"""
