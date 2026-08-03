"""La checklist rendue en conversation (`chatbot.checklist_answer.render_checklist`).

Un point précis est verrouillé ici : la phrase de clôture doit dire la vérité sur
ce qui a servi à établir la liste. Un profil vide donne le socle commun — les
mêmes pièces pour tout le monde — et l'annoncer comme « établie à partir de ce
que vous m'avez indiqué » présente une liste générique comme du sur-mesure.

La sélection Mistral est neutralisée : ces tests portent sur le rendu, pas sur le
choix des pièces (celui-là est couvert par `test_checklist_rules.py`), et la
règle déterministe suffit à produire une liste réelle.
"""

from __future__ import annotations

import pytest

from app.modules.ai.checklist import service as checklist_service
from app.modules.chatbot.checklist_answer import build_profil, render_checklist
from app.modules.profiling.schemas.profil import StatutLogement, StatutProfessionnel


@pytest.fixture(autouse=True)
def sans_mistral(monkeypatch):
    """Force le repli déterministe : pas de réseau, résultat reproductible."""
    monkeypatch.setattr(checklist_service, "select_checklist_items", lambda _profil: None)


def test_profil_vide_annonce_le_socle_commun():
    texte = render_checklist({})
    assert "que vous m’avez indiqué" not in texte
    assert "les pièces demandées dans tous les cas" in texte


def test_profil_absent_annonce_aussi_le_socle_commun():
    """Même traitement pour `None` : dans les deux cas, rien n'a été recueilli."""
    assert "les pièces demandées dans tous les cas" in render_checklist(None)


def test_profil_renseigne_annonce_une_liste_personnalisee():
    texte = render_checklist(
        {"situation_logement": "locataire", "statut_professionnel": "etudiant"}
    )
    assert "que vous m’avez indiqué" in texte
    assert "les pièces demandées dans tous les cas" not in texte


def test_un_profil_entierement_hors_vocabulaire_reste_un_socle_commun():
    """Le LLM a bien rendu un profil, mais aucune valeur n'est exploitable : la liste
    obtenue est le socle commun, la phrase doit le dire."""
    texte = render_checklist({"situation_logement": "sur un bateau", "champ_invente": "oui"})
    assert "les pièces demandées dans tous les cas" in texte


def test_intro_du_modele_precede_la_liste():
    texte = render_checklist({}, intro="Merci, voici ce qu'il vous faut.")
    assert texte.startswith("Merci, voici ce qu'il vous faut.")
    assert "Documents à fournir" in texte


def test_la_liste_est_bien_rendue():
    texte = render_checklist({"situation_logement": "locataire"})
    assert "Documents à fournir pour cette demande d’APL :" in texte
    assert texte.count("•") >= 4  # au moins le socle commun


def test_build_profil_ignore_les_champs_inconnus():
    """Une hallucination de champ ne doit jamais devenir une erreur."""
    profil = build_profil({"champ_invente": "x", "situation_logement": "locataire"})
    assert profil.situation_logement is StatutLogement.locataire


def test_build_profil_accepte_oui_non():
    assert build_profil({"est_boursier": "oui"}).est_boursier is True
    assert build_profil({"est_boursier": "non"}).est_boursier is False


def test_build_profil_sur_une_entree_invalide_donne_un_profil_vide():
    assert not build_profil("pas un dict").model_dump(exclude_none=True)
    assert not build_profil(None).model_dump(exclude_none=True)


def test_build_profil_coerce_les_enums():
    profil = build_profil({"statut_professionnel": "ETUDIANT"})
    assert profil.statut_professionnel is StatutProfessionnel.etudiant


# --- « Selon votre situation » ------------------------------------------------
#
# L'entretien s'arrête à quatre questions, donc des champs restent inconnus. Les pièces
# qui en dépendent ne doivent pas disparaître pour autant : elles sont listées avec leur
# condition, à charge pour le citoyen de se reconnaître. C'est le compromis qui permet
# de ne pas allonger l'entretien pour une pièce qui ne concerne qu'une minorité.


def test_une_piece_conditionnelle_apparait_avec_sa_condition():
    """Étudiant sans réponse sur la bourse : la notification est signalée, sous condition."""
    texte = render_checklist({"statut_professionnel": "etudiant"})
    assert "Selon votre situation, ajoutez aussi :" in texte
    assert "Notification d'attribution de bourse (CROUS) — si vous êtes boursier(ère)." in texte


def test_une_piece_deja_certaine_nest_pas_repetee_en_conditionnelle():
    texte = render_checklist({"statut_professionnel": "etudiant", "est_boursier": True})
    assert texte.count("Notification d'attribution de bourse") == 1
    assert "si vous êtes boursier(ère)" not in texte


def test_une_condition_sans_objet_nest_pas_proposee():
    """Un salarié n'a pas à lire une ligne sur l'ARE ni sur la bourse."""
    texte = render_checklist({"statut_professionnel": "salarie"})
    assert "bourse" not in texte
    assert "ARE" not in texte


def test_le_conjoint_nest_pas_evoque_a_quelquun_qui_vit_seul():
    texte = render_checklist({"statut_marital": "celibataire", "a_des_enfants_a_charge": False})
    assert "conjoint" not in texte


def test_le_couple_declare_ouvre_les_lignes_conjoint_et_livret():
    """« En couple » est enregistré en concubinage : on sait qu'il y a un conjoint, mais
    pas si le mariage ou le PACS est établi — d'où les deux lignes conditionnelles."""
    texte = render_checklist({"statut_marital": "concubinage", "a_des_enfants_a_charge": False})
    assert "revenus de votre conjoint — si vous vivez en couple." in texte
    assert "Livret de famille — si vous êtes marié(e) ou pacsé(e)." in texte


def test_le_livret_certain_ne_redevient_pas_conditionnel():
    """Avec des enfants à charge, le livret est déjà obligatoire : pas de doublon."""
    texte = render_checklist({"statut_marital": "concubinage", "a_des_enfants_a_charge": True})
    assert texte.count("Livret de famille") == 1
    assert "si vous êtes marié(e) ou pacsé(e)" not in texte


def test_la_pension_nest_evoquee_que_sil_y_a_des_enfants():
    avec = render_checklist({"a_des_enfants_a_charge": True})
    sans = render_checklist({"a_des_enfants_a_charge": False})
    assert "pension alimentaire" in avec
    assert "pension alimentaire" not in sans
