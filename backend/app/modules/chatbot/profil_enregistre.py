"""Le profil que le compte connaît déjà, quand il y en a un.

CE MODULE CHANGE UN INVARIANT, et il vaut mieux le dire ici qu'ailleurs. Jusqu'à
présent l'assistant était *aveugle à l'authentification* : le compte ne servait
qu'à connaître le rôle, et le profil utilisé pour la checklist venait uniquement
de ce que la personne déclarait pendant la conversation. La règle avait sa
raison — le même moteur doit servir un canal sans compte (WhatsApp), et
« quels documents pour mon fils étudiant ? » doit marcher comme pour soi.

Elle avait aussi un coût : un citoyen connecté, qui a déjà rempli son profil sur
la plateforme, se voyait reposer les quatre mêmes questions. Répéter à quelqu'un
des questions dont on a déjà la réponse est une façon de lui dire qu'on ne l'a
pas écouté.

LA NOUVELLE RÈGLE, PLUS ÉTROITE QUE L'ANCIENNE N'ÉTAIT LARGE :

- rien n'est lu sans compte — le canal anonyme se comporte exactement comme avant ;
- rien n'est lu ailleurs que dans le profil déclaratif (`citizens.profile_data`) :
  ni dossier, ni pièces déposées, ni décisions, ni identité ;
- rien n'est utilisé sans être MONTRÉ et confirmé par le citoyen (voir
  `orchestrator.documents_necessaires_node`) ;
- rien ne part au modèle : le profil alimente les règles déterministes de la
  checklist, comme les réponses de l'entretien qu'il remplace.

LECTURE SEULE, ET C'EST UNE CONTRAINTE. On n'utilise volontairement pas
`citizen.profile.resolve_citizen`, qui CRÉE la ligne applicant si elle manque :
poser une question à un assistant ne doit pas ouvrir un dossier au nom de
quelqu'un. Une simple requête, aucun effet de bord.

SESSION COURTE, ouverte et refermée ici. Le routeur n'injecte plus de session
dans ce chemin, précisément pour ne pas retenir une connexion PostgreSQL pendant
les secondes d'attente du modèle (voir `history.record_turn`, même motif). La
lecture se fait donc avant le graphe, en quelques millisecondes.
"""

from __future__ import annotations

from sqlalchemy import select

from app.core.logger import logger
from app.database.session import SessionLocal
from app.modules.agent.models import Citizen
from app.modules.auth.models import User


def pour(user: User | None) -> dict | None:
    """Le profil déclaratif enregistré pour ce compte, ou None.

    None couvre indifféremment : pas de compte, pas de ligne citoyen, profil vide,
    ou base indisponible. L'appelant n'a aucune raison de distinguer ces cas — dans
    tous, il n'y a rien à proposer et l'entretien se déroule normalement.

    Ne lève jamais : le profil enregistré est un CONFORT (éviter des questions
    déjà répondues), pas une dépendance. Une base injoignable doit coûter quatre
    questions au citoyen, pas sa réponse."""
    if user is None:
        return None
    try:
        with SessionLocal() as db:
            profil = db.execute(
                select(Citizen.profile_data).where(Citizen.user_id == user.id)
            ).scalars().first()
    except Exception:  # noqa: BLE001 — voir la docstring : dégrader, jamais échouer
        logger.exception(
            "chatbot: lecture du profil enregistré impossible", {"user_id": user.id}
        )
        return None
    return profil or None
