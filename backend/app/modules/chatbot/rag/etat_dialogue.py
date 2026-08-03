"""Le petit état qui voyage avec une question de clarification.

Le backend ne garde aucune session : l'état d'un dialogue en cours fait
l'aller-retour par le client, comme l'historique. Le champ utilisé est
`pending_clarification.original_question`, que le client renvoie tel quel sans
jamais l'afficher — c'est du bookkeeping entre deux appels d'un même nœud, pas
une donnée montrée au citoyen.

Trois nœuds s'en servent désormais (estimation, documents, rag_general) et
écrivaient chacun leur propre encodage. Une seule implémentation ici, sous une
clé propre à chaque nœud : un état écrit par l'estimation ne peut pas être lu
par le profilage, et un `original_question` qui contient une vraie question de
citoyen (le cas d'avant) se relit simplement comme « pas d'état ».

RIEN DE CE QUI TRANSITE ICI N'EST DE CONFIANCE. L'état vient du client : chaque
lecteur revalide ce qu'il reçoit plutôt que de s'y fier.
"""

from __future__ import annotations

import json
from typing import Optional


def encoder(cle: str, valeur) -> str:
    return json.dumps({cle: valeur}, ensure_ascii=False)


def decoder(pending: Optional[dict], cle: str):
    """La valeur rangée sous `cle`, ou None si rien de lisible ne s'y trouve.

    Ne lève jamais : un état illisible doit faire repartir le dialogue de zéro,
    ce qui est désagréable, et non planter la réponse, ce qui serait pire."""
    if not pending:
        return None
    try:
        contenu = json.loads(pending.get("original_question") or "")
    except (json.JSONDecodeError, TypeError, AttributeError):
        return None
    if not isinstance(contenu, dict):
        return None
    return contenu.get(cle)
