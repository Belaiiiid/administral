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


#: Les seuls rôles qu'un tour PASSÉ peut porter. `system` en est volontairement absent :
#: c'est la couche d'instructions du modèle, elle n'appartient qu'au code.
ROLES_DE_CONVERSATION = ("user", "assistant")
#: Bornes appliquées au moment d'écrire le prompt, indépendamment de qui a fourni
#: l'historique (voir `historique_de_confiance`).
HISTORIQUE_TOURS_MAX = 20
HISTORIQUE_CONTENU_MAX = 4000


def historique_de_confiance(conversation_history):
    """Filtre un historique fourni par l'appelant avant de l'écrire dans un prompt.

    L'historique ne vient JAMAIS du serveur : le moteur ne garde aucune session, c'est
    le client qui le renvoie à chaque tour. Il est donc, par construction, une entrée
    non fiable recopiée dans le prompt — et un `{"role": "system"}` glissé dedans
    ajoute des consignes au modèle sur toutes les branches.

    Le schéma HTTP borne déjà tout cela. Ce filtre-ci existe parce que le schéma ne
    protège QUE la route HTTP, alors que ce moteur est explicitement prévu pour servir
    un second canal sans compte (WhatsApp, cf. les docstrings du module) qui ne passera
    pas par lui. La garantie doit tenir là où le prompt s'écrit, pas seulement à la
    porte d'entrée : un tour au rôle inconnu est écarté, jamais réinterprété."""
    propres = []
    for tour in conversation_history or []:
        if not isinstance(tour, dict):
            continue
        role = tour.get("role")
        contenu = tour.get("content")
        if role not in ROLES_DE_CONVERSATION or not isinstance(contenu, str) or not contenu:
            continue
        propres.append({"role": role, "content": contenu[:HISTORIQUE_CONTENU_MAX]})
    return propres[-HISTORIQUE_TOURS_MAX:]


def _enforce_standard_options(options):
    """Insère EXPLAIN_OPTION et SKIP_OPTION à la fin de la liste d'options, quoi que le LLM
    ait produit (il peut les oublier ou les mal placer - on ne compte pas sur lui pour ça)."""
    real_options = [o for o in options if o not in (EXPLAIN_OPTION, SKIP_OPTION)]
    return real_options + [EXPLAIN_OPTION, SKIP_OPTION]


def with_standard_options(options):
    """Même garantie, pour les clarifications écrites PAR LE CODE et non par le LLM.

    Une question posée en dur (la date d'une décision contestée, par exemple) doit offrir
    exactement les mêmes échappatoires au citoyen que celles du LLM : pouvoir demander une
    explication, et pouvoir passer. Sans ce point d'entrée public, chaque question codée en
    dur réinventerait ses propres options - et finirait par en oublier une."""
    return _enforce_standard_options(list(options))


class LlmContractError(RuntimeError):
    """Le modèle n'a pas rendu le JSON demandé, et on refuse d'en faire une réponse.

    Volontairement une EXCEPTION plutôt qu'une valeur de repli. Le repli précédent
    ({"type": "answer", "text": <texte brut>}) était indistinguable d'une vraie réponse :
    les appelants testaient `type == "clarification"` et traitaient tout le reste comme
    définitif, si bien qu'un JSON tronqué était affiché tel quel au citoyen - avec, sur la
    branche RAG, des sources officielles épinglées dessous. Une erreur qui ressemble à une
    réponse sourcée est précisément ce que le reste de ce moteur s'efforce d'éviter.

    Lever change le SENS DU DÉFAUT : un appelant qui n'y pense pas laisse remonter
    l'exception jusqu'au filet de `service.answer_question`, qui rend un message
    d'indisponibilité. C'est moche, mais c'est sûr — là où l'ancien défaut était
    « montrer n'importe quoi »."""


#: Une seule relance avant d'abandonner. La génération tourne à temperature 0.2 : un JSON
#: mal formé est le plus souvent un accident, et la deuxième tentative passe. Au-delà, on
#: fait attendre le citoyen pour un modèle qui, visiblement, ne suit pas le contrat.
_STRUCTURED_ATTEMPTS = 2


def _parse_structured(raw):
    """Valide le contrat, ou lève. Ne rattrape RIEN : c'est l'appelant qui décide."""
    parsed = json.loads(raw)  # lève sur JSON invalide, None, texte libre
    if not isinstance(parsed, dict):
        raise ValueError("le JSON rendu n'est pas un objet")
    if parsed.get("type") not in ("answer", "clarification") or not parsed.get("text"):
        raise ValueError("forme JSON inattendue")
    parsed.setdefault("options", None)
    if parsed["type"] == "clarification" and isinstance(parsed["options"], list):
        parsed["options"] = _enforce_standard_options(parsed["options"])
    return parsed


def call_llm_structured(messages, model="mistral-small-latest", provider="mistral", temperature=0.0):
    """Comme call_llm, mais force une sortie JSON avec le contrat
    {"type": "answer"|"clarification", "text": str, "options": list|None} et la parse.
    Si "options" est une liste (clarification à choix), EXPLAIN_OPTION et SKIP_OPTION sont
    garantis présents en fin de liste par le code (voir _enforce_standard_options).

    Lève `LlmContractError` si le contrat n'est pas tenu après une relance - le prompt
    système appelant doit le décrire explicitement (cf. GENERATION_SYSTEM_PROMPT,
    DOCUMENTS_SYSTEM_PROMPT). Une panne d'API, elle, remonte telle quelle depuis
    `call_llm` : ce n'est pas la même chose qu'un modèle qui répond à côté."""
    dernier_motif = None
    for _tentative in range(_STRUCTURED_ATTEMPTS):
        raw = call_llm(
            messages=messages, model=model, provider=provider,
            temperature=temperature, json_mode=True,
        )
        try:
            return _parse_structured(raw)
        except (json.JSONDecodeError, ValueError, TypeError, AttributeError) as exc:
            # Le texte brut n'est gardé que pour le diagnostic, tronqué : il ne doit
            # jamais ressortir vers le citoyen, c'est tout l'objet de ce correctif.
            dernier_motif = f"{exc} — début de la réponse : {str(raw)[:200]!r}"

    raise LlmContractError(
        f"Réponse illisible après {_STRUCTURED_ATTEMPTS} tentatives ({dernier_motif})"
    )


if __name__ == "__main__":
    # petit test manuel - nécessite MISTRAL_API_KEY dans l'environnement
    result = call_llm([{"role": "user", "content": "Réponds juste 'ok' si tu me reçois."}])
    print(result)