"""Le profil déjà saisi par un citoyen connecté, relu avant d'être utilisé.

CE QUI CHANGE. L'assistant était aveugle à l'authentification : un citoyen qui
avait déjà rempli son profil sur la plateforme se voyait reposer les quatre mêmes
questions. La règle avait sa raison (le même moteur sert un canal sans compte, et
« pour mon fils étudiant » doit marcher comme pour soi) mais elle coûtait cher à
celui qui avait joué le jeu.

CE QUI NE CHANGE PAS, et que ces tests verrouillent :

- sans compte, RIEN n'est lu et l'entretien est identique à la version précédente ;
- rien n'est utilisé sans être MONTRÉ : le profil est relu, puis confirmé. Un
  dossier peut dater, et une liste de pièces fausse établie sur une situation
  périmée est indétectable pour celui qui la reçoit ;
- le cas du tiers reste possible, tranché par le citoyen (« C'est pour quelqu'un
  d'autre ») et non par une analyse des pronoms de son message — « mon logement »
  et « mon fils » sont grammaticalement identiques ;
- une question dont le profil ne donne qu'une moitié de réponse est POSÉE.

Aucun appel réseau, aucune base : le profil est injecté dans l'état comme le fait
la couche service.
"""

from __future__ import annotations

import pytest

from app.modules.chatbot.rag import orchestrator as o
from app.modules.chatbot.rag import profilage_documents as pd
from app.modules.chatbot.rag.llm_client import EXPLAIN_OPTION, SKIP_OPTION

PROFIL_COMPLET = {
    "situation_logement": "locataire",
    "statut_professionnel": "salarie",
    "statut_marital": "celibataire",
    "a_des_enfants_a_charge": False,
    "type_location": "meublee",
}


def _etat(message: str, *, profil=None, pending=None, reponse=None) -> dict:
    """L'état tel que `service.answer_question` le construit pour un tour."""
    return {
        "message": message,
        "conversation_history": [],
        "citizen_profile": profil,
        "intent": "documents_necessaires",
        "response": None,
        "response_options": None,
        "pending_clarification": pending,
        "clarification_reply": reponse,
        "user_role": "citizen",
        "answer": None,
        "sources": None,
        "collected_profile": None,
        "date_reference": None,
        "date_asked": False,
    }


def _repondre(sortie: dict, message: str, *, profil=None, reponse="option") -> dict:
    """Enchaîne un tour de plus, en renvoyant l'état de clarification comme le client."""
    return o.documents_necessaires_node(
        _etat(message, profil=profil, pending=sortie["pending_clarification"], reponse=reponse)
    )


# --- La lecture du profil ----------------------------------------------------


def test_un_profil_complet_donne_toutes_les_reponses_de_base():
    connu = pd.depuis_profil(PROFIL_COMPLET)
    assert set(connu) >= set(pd.CHAMPS_BASE)
    assert pd.prochain_champ(connu) is None, "l'entretien devrait être déjà terminé"


def test_une_question_a_deux_champs_nest_pas_reprise_a_moitie():
    """Le foyer dit la situation maritale ET les enfants : sans les deux, on demande.

    Répondre à moitié à la place du citoyen reviendrait à décider pour lui de la
    moitié manquante — ici, l'existence d'enfants à charge, qui ajoute des pièces."""
    connu = pd.depuis_profil({"statut_marital": "celibataire"})
    assert "foyer" not in connu


def test_une_valeur_hors_vocabulaire_est_ignoree():
    """Rien d'étranger au vocabulaire de l'entretien n'atteint les règles de checklist."""
    connu = pd.depuis_profil({"situation_logement": "chateau", "statut_professionnel": "salarie"})
    assert "logement" not in connu
    assert connu["activite"] == {"statut_professionnel": "salarie"}


@pytest.mark.parametrize("profil", [None, {}, "pas un dict", []])
def test_un_profil_absent_ou_illisible_ne_donne_rien(profil):
    assert pd.depuis_profil(profil) == {}


def test_le_recapitulatif_dit_ce_qui_sera_utilise():
    """Les libellés du récapitulatif viennent des choix RÉELLEMENT retenus."""
    resume = pd.resume_profil(pd.depuis_profil(PROFIL_COMPLET))
    assert "locataire" in resume
    assert "salarié(e)" in resume
    assert "seul(e) sans enfant à charge" in resume


# --- Le tour de confirmation -------------------------------------------------


def test_sans_compte_lentretien_commence_comme_avant():
    """NON-RÉGRESSION : le canal anonyme ne doit rien voir de tout ceci."""
    sortie = o.documents_necessaires_node(_etat("quels documents pour l'APL ?"))
    assert sortie["answer"] == pd.QUESTIONS["logement"].texte
    assert sortie["pending_clarification"].get("step") is None


def test_un_citoyen_connecte_se_voit_relire_son_profil():
    sortie = o.documents_necessaires_node(
        _etat("quels documents pour l'APL ?", profil=PROFIL_COMPLET)
    )
    assert "D'après votre dossier" in sortie["answer"]
    assert "locataire" in sortie["answer"] and "salarié(e)" in sortie["answer"]
    assert sortie["pending_clarification"]["step"] == o.ETAPE_CONFIRMATION_PROFIL
    # Ce qui est proposé n'est pas encore retenu.
    assert sortie["collected_profile"] is None
    assert pd.decoder_etat(sortie["pending_clarification"]) == {}
    for option in (o.OPTION_PROFIL_OK, o.OPTION_PROFIL_CHANGE, o.OPTION_PROFIL_AUTRE):
        assert option in sortie["response_options"]
    # Les deux échappatoires standard restent offertes, comme sur toute question.
    assert EXPLAIN_OPTION in sortie["response_options"]
    assert SKIP_OPTION in sortie["response_options"]


def test_oui_evite_les_quatre_questions():
    """Le gain visé : un profil complet et confirmé produit la checklist tout de suite."""
    confirmation = o.documents_necessaires_node(
        _etat("quels documents ?", profil=PROFIL_COMPLET)
    )
    sortie = _repondre(confirmation, o.OPTION_PROFIL_OK, profil=PROFIL_COMPLET)

    assert sortie["pending_clarification"] is None
    assert sortie["collected_profile"] is not None
    assert sortie["collected_profile"]["situation_logement"] == "locataire"
    assert sortie["collected_profile"]["statut_professionnel"] == "salarie"


@pytest.mark.parametrize(
    "refus", ["Ma situation a changé", "C'est pour quelqu'un d'autre", "Passer cette question"]
)
def test_un_refus_rend_la_main_a_lentretien_ordinaire(refus):
    """« Pour mon fils étudiant » est tranché ici, par le citoyen, pas par une regex."""
    confirmation = o.documents_necessaires_node(
        _etat("quels documents ?", profil=PROFIL_COMPLET)
    )
    sortie = _repondre(confirmation, refus, profil=PROFIL_COMPLET)

    assert sortie["answer"] == pd.QUESTIONS["logement"].texte
    assert pd.decoder_etat(sortie["pending_clarification"]) == {}, "le profil a été repris malgré le refus"


def test_une_reponse_non_reconnue_ne_vaut_pas_un_oui():
    """Le défaut penche du côté de la question posée en trop, jamais de la reprise à tort."""
    confirmation = o.documents_necessaires_node(
        _etat("quels documents ?", profil=PROFIL_COMPLET)
    )
    sortie = _repondre(confirmation, "euh je sais pas trop", profil=PROFIL_COMPLET)

    assert sortie["answer"] == pd.QUESTIONS["logement"].texte
    assert sortie["collected_profile"] is None


def test_je_ne_comprends_pas_explique_puis_repose_la_meme_question():
    confirmation = o.documents_necessaires_node(
        _etat("quels documents ?", profil=PROFIL_COMPLET)
    )
    sortie = _repondre(confirmation, EXPLAIN_OPTION, profil=PROFIL_COMPLET)

    assert o.EXPLICATION_PROFIL in sortie["answer"]
    assert "D'après votre dossier" in sortie["answer"]
    assert sortie["pending_clarification"]["step"] == o.ETAPE_CONFIRMATION_PROFIL


def test_un_profil_partiel_ne_fait_poser_que_ce_qui_manque():
    """La moitié connue est reprise, l'autre est demandée — pas de tout ou rien."""
    partiel = {"situation_logement": "locataire", "type_location": "meublee"}
    confirmation = o.documents_necessaires_node(_etat("quels documents ?", profil=partiel))
    sortie = _repondre(confirmation, o.OPTION_PROFIL_OK, profil=partiel)

    assert sortie["answer"] == pd.QUESTIONS["activite"].texte, "l'activité restait inconnue"
    reprises = pd.decoder_etat(sortie["pending_clarification"])
    assert reprises["logement"] == {"situation_logement": "locataire"}


def test_le_profil_ne_court_circuite_pas_un_entretien_deja_commence():
    """Une fois l'entretien lancé, ses réponses font foi — on ne repropose pas le profil."""
    premiere = o.documents_necessaires_node(_etat("quels documents ?"))
    sortie = _repondre(premiere, "Je suis propriétaire", profil=PROFIL_COMPLET)

    assert sortie["answer"] == pd.QUESTIONS["activite"].texte
    reprises = pd.decoder_etat(sortie["pending_clarification"])
    assert reprises["logement"] == {"situation_logement": "proprietaire"}, (
        "la réponse donnée dans la conversation doit primer sur le profil enregistré"
    )
