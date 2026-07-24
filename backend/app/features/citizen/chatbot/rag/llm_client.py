"""
Point d'entrée UNIQUE pour tous les appels LLM du projet D4.
Isolé exprès : quand l'équipe fera du benchmarking sur d'autres LLMs,
seul ce fichier doit changer (le reste du code appelle call_llm()).
"""
import os
import json
from mistralai.client import Mistral
from dotenv import load_dotenv

load_dotenv()

_client = None

def get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("MISTRAL_API_KEY")
        if not api_key:
            # Fall back to MonParcours' central configuration: its `.env` is read
            # by pydantic-settings and not exported to os.environ. This keeps the
            # single-LLM-entry-point design intact while sharing one key source.
            from app.core.config import settings

            api_key = settings.mistral_api_key
        if not api_key:
            raise RuntimeError(
                "Variable d'environnement MISTRAL_API_KEY manquante. "
                "Fais: export MISTRAL_API_KEY=ta_cle (Linux/Mac) ou "
                "$env:MISTRAL_API_KEY='ta_cle' (PowerShell)"
            )
        _client = Mistral(api_key=api_key)
    return _client


def call_llm(messages, model="mistral-small-latest", json_mode=False, temperature=0.0):
    """
    messages: liste de dicts [{"role": "system"|"user"|"assistant", "content": "..."}]
    json_mode: si True, force une sortie JSON valide (encore faut-il le demander
               explicitement dans le prompt, cf. doc Mistral)
    Retourne: le texte de la réponse (str)
    """
    client = get_client()
    kwargs = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.complete(
        model=model,
        messages=messages,
        temperature=temperature,
        **kwargs,
    )
    return response.choices[0].message.content


if __name__ == "__main__":
    # petit test manuel - nécessite MISTRAL_API_KEY dans l'environnement
    result = call_llm([{"role": "user", "content": "Réponds juste 'ok' si tu me reçois."}])
    print(result)