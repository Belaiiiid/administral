"""Citizen AI Assistant — the single chatbot of MonParcours.

Wraps the migrated APL RAG engine (`.rag`) behind MonParcours conventions:

- ``router``  : the HTTP endpoint (`/citizen/chatbot/message`), JWT-protected.
- ``service`` : routes each turn through the RAG LangGraph orchestrator and
                reconnects the dossier/profil intents to MonParcours services
                instead of the engine's mocks (general APL → RAG).
- ``schemas`` : the wire contract the existing chatbot frontend already speaks.

This replaces the previous keyword-KB assistant (`app.modules.ai.chatbot`): there
is exactly one Citizen AI Assistant.
"""
