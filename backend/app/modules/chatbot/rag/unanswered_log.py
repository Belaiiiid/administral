# -*- coding: utf-8 -*-
"""Journal des questions restées sans réponse.

RÈGLE PRODUIT : quand le chatbot n'a pas la réponse, il ne répond pas. Il le dit, renvoie
vers la source officielle, et la question est CONSIGNÉE ici. Une réponse approximative sur
une aide sociale coûte plus cher au citoyen qu'un « je ne sais pas » honnête - mais un
« je ne sais pas » qui disparaît sans laisser de trace ne fait progresser personne.

Ce journal est donc la boucle de retour du produit : il dit ce qui manque au corpus. Un
agent CAF le relit, repère les questions qui reviennent, et on enrichit les sources en
conséquence (nouvelle page CAF extraite, article de loi ajouté au graphe...).

FORMAT : JSON Lines (`data/questions_sans_reponse.jsonl`), une ligne par question, en
ajout seul. Choisi exprès : un fichier qui grossit par ajout ne peut pas être corrompu par
un écrasement concurrent, et il se relit avec n'importe quel outil, ligne par ligne.

CE QUI N'EST PAS ÉCRIT ICI : aucune donnée d'identité. Le chat n'a pas d'authentification
(voir CLAUDE.md, décisions 11 et 15) et n'a donc rien à consigner sur QUI a posé la
question - seulement CE QUI manquait pour y répondre.
"""
import json
import os
from datetime import datetime

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(_BASE_DIR, "data", "questions_sans_reponse.jsonl")

# Vers où renvoyer le citoyen quand on ne sait pas. Volontairement les deux : le site de
# l'administration pour la démarche, la CAF pour son dossier.
REDIRECTION_OFFICIELLE = (
    "Je préfère vous le dire franchement : je n'ai pas l'information nécessaire pour vous "
    "répondre avec certitude, et je ne veux pas vous donner une réponse approximative sur "
    "un sujet qui engage vos droits.\n\n"
    "Vous trouverez une réponse fiable sur service-public.fr ou caf.fr, et votre CAF peut "
    "vous répondre directement (par la messagerie de votre espace personnel, ou au 3230).\n\n"
    "Votre question est notée : elle nous sert à repérer ce qu'il manque à l'assistant."
)


def log_unanswered(question, intent, raison, details=None, user_role="citizen"):
    """Consigne une question sans réponse. Ne lève jamais : un journal cassé ne doit pas
    priver le citoyen de sa réponse (fût-elle un « je ne sais pas »)."""
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        entree = {
            "horodatage": datetime.now().isoformat(timespec="seconds"),
            "question": question,
            "intent": intent,          # la branche qui a renoncé
            "raison": raison,          # pourquoi : voir les constantes ci-dessous
            "role": user_role,         # citoyen ou agent : le manque n'est pas le même
            "details": details or {},  # ex: les références introuvables dans le graphe
        }
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entree, ensure_ascii=False) + "\n")
    except Exception as e:  # noqa: BLE001
        print(f"[unanswered_log] écriture impossible ({e}) - question non consignée")


# Raisons, pour pouvoir trier le journal ensuite.
RAISON_HORS_SUJET = "hors_sujet"                  # le classifieur n'a rien reconnu
RAISON_AUCUN_ARTICLE = "aucun_article_trouve"     # branche juridique : rien dans le graphe
RAISON_REFERENCE_INCONNUE = "reference_inconnue"  # article cité absent du graphe
RAISON_EXTRAITS_INSUFFISANTS = "extraits_insuffisants"  # RAG : le corpus ne permet pas de répondre
#: Le modèle n'a pas rendu le JSON demandé, même après relance (voir
#: `llm_client.LlmContractError`). Seule raison de cette liste qui ne dit rien du corpus :
#: elle ne demande pas d'enrichir les sources mais de surveiller le modèle. Sans elle,
#: cette panne-là ne laissait aucune trace du tout.
RAISON_REPONSE_ILLISIBLE = "reponse_illisible"
#: Le plafond de clarifications est atteint et le modèle voulait encore questionner : le
#: code a tranché. Souvent le signe que le corpus ne contient pas de quoi répondre et que
#: le modèle tourne autour - donc une piste d'enrichissement, pas seulement un incident.
RAISON_TROP_DE_CLARIFICATIONS = "trop_de_clarifications"


def lire_journal(limite=None):
    """Relecture du journal (pour un agent, ou un futur écran d'administration)."""
    if not os.path.exists(LOG_FILE):
        return []
    with open(LOG_FILE, encoding="utf-8") as f:
        lignes = [json.loads(ligne) for ligne in f if ligne.strip()]
    return lignes[-limite:] if limite else lignes


if __name__ == "__main__":
    import collections
    import io
    import sys

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

    entrees = lire_journal()
    print(f"{len(entrees)} question(s) sans réponse consignée(s) dans {LOG_FILE}\n")
    if not entrees:
        raise SystemExit

    for raison, nombre in collections.Counter(e["raison"] for e in entrees).most_common():
        print(f"  {nombre:4} × {raison}")
    print("\nDernières questions :")
    for entree in entrees[-15:]:
        print(f"  [{entree['horodatage']}] ({entree['raison']}) {entree['question']}")
