"""
Point d'entrée UNIQUE pour tous les appels LLM du projet D4.
Isolé exprès : quand l'équipe fera du benchmarking sur d'autres LLMs,
seul ce fichier doit changer (le reste du code appelle call_llm()).

Multi-provider (benchmarking) : "mistral" utilise le SDK natif Mistral (modèle
de prod par défaut). Les autres providers (ex: "groq") utilisent le SDK openai
générique pointé sur leur base_url, car ils exposent une API compatible OpenAI
- pas besoin d'un SDK dédié par provider.
"""
import json
import os
from mistralai.client import Mistral
from dotenv import load_dotenv
from langsmith import traceable

# `openai` n'est utilisé que par les providers compatibles OpenAI (benchmarking) :
# il est importé paresseusement dans get_openai_compatible_client() pour que la
# prod MonParcours (Mistral uniquement) n'ait pas à l'installer.

load_dotenv()

_mistral_client = None
_openai_compatible_clients = {}  # provider -> client OpenAI configuré

# base_url des providers compatibles OpenAI, et variable d'env pour leur clé
OPENAI_COMPATIBLE_PROVIDERS = {
    "groq": {"base_url": "https://api.groq.com/openai/v1", "env_var": "GROQ_API_KEY"},
}


def get_mistral_client():
    global _mistral_client
    if _mistral_client is None:
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
        _mistral_client = Mistral(api_key=api_key)
    return _mistral_client


def get_openai_compatible_client(provider):
    if provider not in OPENAI_COMPATIBLE_PROVIDERS:
        raise ValueError(f"Provider inconnu: '{provider}'. Providers disponibles: mistral, {', '.join(OPENAI_COMPATIBLE_PROVIDERS)}")
    if provider not in _openai_compatible_clients:
        from openai import OpenAI  # import paresseux: dépendance de benchmarking, pas de prod

        config = OPENAI_COMPATIBLE_PROVIDERS[provider]
        api_key = os.environ.get(config["env_var"])
        if not api_key:
            raise RuntimeError(
                f"Variable d'environnement {config['env_var']} manquante pour le provider '{provider}'. "
                f"Ajoute-la dans .env."
            )
        _openai_compatible_clients[provider] = OpenAI(base_url=config["base_url"], api_key=api_key)
    return _openai_compatible_clients[provider]


@traceable(name="call_llm", run_type="llm")
def call_llm(messages, model="mistral-small-latest", provider="mistral", json_mode=False, temperature=0.0):
    """
    messages: liste de dicts [{"role": "system"|"user"|"assistant", "content": "..."}]
    provider: "mistral" (défaut, prod) ou un provider compatible OpenAI (ex: "groq")
              utilisé pour le benchmarking multi-LLM.
    json_mode: si True, force une sortie JSON valide (encore faut-il le demander
               explicitement dans le prompt, cf. doc du provider)
    Retourne: le texte de la réponse (str)
    """
    kwargs = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    if provider == "mistral":
        response = get_mistral_client().chat.complete(
            model=model,
            messages=messages,
            temperature=temperature,
            **kwargs,
        )
    else:
        response = get_openai_compatible_client(provider).chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            **kwargs,
        )
    return response.choices[0].message.content


# Options standard ajoutées à TOUTE clarification à choix (garanties par le code, pas par le
# prompt - un citoyen peu à l'aise avec la techno doit toujours pouvoir demander une explication
# plutôt que de deviner, et toujours pouvoir passer la question).
EXPLAIN_OPTION = "Je ne comprends pas, expliquez-moi"
SKIP_OPTION = "Passer cette question"


def _enforce_standard_options(options):
    """Insère EXPLAIN_OPTION et SKIP_OPTION à la fin de la liste d'options, quoi que le LLM
    ait produit (il peut les oublier ou les mal placer - on ne compte pas sur lui pour ça)."""
    real_options = [o for o in options if o not in (EXPLAIN_OPTION, SKIP_OPTION)]
    return real_options + [EXPLAIN_OPTION, SKIP_OPTION]


def call_llm_structured(messages, model="mistral-small-latest", provider="mistral", temperature=0.0):
    """Comme call_llm, mais force une sortie JSON avec le contrat
    {"type": "answer"|"clarification", "text": str, "options": list|None} et la parse.
    Si "options" est une liste (clarification à choix), EXPLAIN_OPTION et SKIP_OPTION sont
    garantis présents en fin de liste par le code (voir _enforce_standard_options).
    En cas de JSON malformé ou de forme inattendue (jamais de crash), repli sur
    {"type": "answer", "text": <texte brut>, "options": None} - le prompt système
    appelant doit décrire ce contrat explicitement (cf. GENERATION_SYSTEM_PROMPT,
    DOCUMENTS_SYSTEM_PROMPT)."""
    raw = call_llm(messages=messages, model=model, provider=provider, temperature=temperature, json_mode=True)
    try:
        parsed = json.loads(raw)
        if parsed.get("type") not in ("answer", "clarification") or not parsed.get("text"):
            raise ValueError("forme JSON inattendue")
        parsed.setdefault("options", None)
        if parsed["type"] == "clarification" and isinstance(parsed["options"], list):
            parsed["options"] = _enforce_standard_options(parsed["options"])
        return parsed
    except Exception:
        return {"type": "answer", "text": raw, "options": None}


if __name__ == "__main__":
    # petit test manuel - nécessite MISTRAL_API_KEY dans l'environnement
    result = call_llm([{"role": "user", "content": "Réponds juste 'ok' si tu me reçois."}])
    print(result)