"""Cross-cutting notifications.

One table, one recipient per row (``user_id``), consumed by both portals — the
citizen sees decisions on their dossiers, the agent sees new dossiers landing in
the queue. Emitted by real domain events (submission, decision), never seeded in
production.
"""
