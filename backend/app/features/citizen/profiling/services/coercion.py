"""
Convertit la réponse brute du citoyen (texte libre ou libellé de bouton) vers
le type attendu par le champ ciblé du profil_partiel. Volontairement tolérant
(le citoyen tape "1200", "1 200", "1200€"...), mais échoue explicitement si la
valeur est inexploitable plutôt que de deviner silencieusement.
"""
from __future__ import annotations

import re
import unicodedata

from app.features.citizen.profiling.schemas.agent import AnalyseReponse, TypeReponsePercue
from app.features.citizen.profiling.schemas.profil import StatutLogement, StatutMarital, StatutProfessionnel, TypeLocation

_OUI = {"oui", "yes", "true", "1"}
_NON = {"non", "no", "false", "0"}

_LOGEMENT_LABELS = {
    "locataire": StatutLogement.locataire,
    "propriétaire": StatutLogement.proprietaire,
    "proprietaire": StatutLogement.proprietaire,
    "hébergé(e) à titre gratuit": StatutLogement.heberge,
    "heberge": StatutLogement.heberge,
    "hébergé": StatutLogement.heberge,
}

_LOCATION_LABELS = {
    "location vide (non meublée)": TypeLocation.vide,
    "vide": TypeLocation.vide,
    "location meublée": TypeLocation.meublee,
    "meublee": TypeLocation.meublee,
    "meublée": TypeLocation.meublee,
    "chambre": TypeLocation.chambre,
    "colocation": TypeLocation.colocation,
    "sous-location": TypeLocation.sous_location,
    "sous location": TypeLocation.sous_location,
    "sous_location": TypeLocation.sous_location,
    "foyer / résidence (crous, ehpad...)": TypeLocation.residence_etudiante,
    "foyer / residence": TypeLocation.residence_etudiante,
    "résidence universitaire / crous": TypeLocation.residence_etudiante,
    "residence universitaire / crous": TypeLocation.residence_etudiante,
    "résidence étudiante": TypeLocation.residence_etudiante,
    "residence etudiante": TypeLocation.residence_etudiante,
    "crous": TypeLocation.residence_etudiante,
    "ehpad": TypeLocation.residence_etudiante,
}

_MARITAL_LABELS = {
    "célibataire": StatutMarital.celibataire,
    "celibataire": StatutMarital.celibataire,
    "marié(e)": StatutMarital.marie,
    "marie": StatutMarital.marie,
    "pacsé(e)": StatutMarital.pacse,
    "pacse": StatutMarital.pacse,
    "en concubinage": StatutMarital.concubinage,
    "concubinage": StatutMarital.concubinage,
}

_STATUT_PRO_LABELS = {
    "étudiant(e)": StatutProfessionnel.etudiant,
    "etudiant(e)": StatutProfessionnel.etudiant,
    "étudiant": StatutProfessionnel.etudiant,
    "etudiant": StatutProfessionnel.etudiant,
    "apprenti(e)/alternant(e)": StatutProfessionnel.apprenti_alternant,
    "apprenti/alternant": StatutProfessionnel.apprenti_alternant,
    "apprenti": StatutProfessionnel.apprenti_alternant,
    "alternant": StatutProfessionnel.apprenti_alternant,
    "salarié(e)": StatutProfessionnel.salarie,
    "salarie(e)": StatutProfessionnel.salarie,
    "salarié": StatutProfessionnel.salarie,
    "salarie": StatutProfessionnel.salarie,
    "demandeur d'emploi": StatutProfessionnel.demandeur_emploi,
    "demandeur demploi": StatutProfessionnel.demandeur_emploi,
    "indépendant(e)": StatutProfessionnel.independant,
    "independant(e)": StatutProfessionnel.independant,
    "indépendant": StatutProfessionnel.independant,
    "independant": StatutProfessionnel.independant,
}

_CHAMPS_BOOLEENS = {
    "logement_appartient_a_un_proche",
    "logement_conventionne",
    "moins_de_30_ans",
    "sous_location_declaree",
    "percoit_pension_alimentaire",
    "est_boursier",
    "percoit_are",
    "a_des_enfants_a_charge",
}
_CHAMPS_FLOTTANTS = {
    "loyer_mensuel",
    "surface_m2",
    "revenu_fiscal_reference",
    "redevance_mensuelle",
    "revenus_conjoint_mensuels",
    "montant_bourse",
    "revenus_nets_mensuels",
    "montant_are_mensuel",
    "chiffre_affaires_annuel",
    "montant_pension_alimentaire",
}
_CHAMPS_ENTIERS = {"nombre_enfants_a_charge", "nombre_adultes_rattaches"}


class ReponseInvalide(ValueError):
    pass


_EXPLICATIONS = {
    "est_boursier": "Une bourse est une aide financière accordée pour les études, par exemple une bourse sur critères sociaux du Crous.",
    "percoit_are": "L’ARE est l’allocation versée par France Travail aux personnes inscrites comme demandeuses d’emploi, sous conditions.",
    "a_des_enfants_a_charge": "Un enfant à charge est un enfant qui vit avec vous ou dont vous assurez principalement l’entretien et l’éducation.",
    "logement_conventionne": "Un logement conventionné ouvre droit à une aide au logement. Cette information figure souvent sur le bail ou peut être confirmée par le bailleur.",
    "sous_location_declaree": "Une sous-location déclarée est autorisée par le propriétaire et mentionnée ou justifiable auprès de lui.",
}
_MOTS_CLARIFICATION = (
    "c est quoi",
    "qu est ce que",
    "explique",
    "je ne comprends",
    "j comprends pas",
    "comment savoir",
    "ca veut dire quoi",
)
_NOMBRES_FR = {"zero": 0, "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5}


def _normaliser(valeur: str) -> str:
    sans_accents = "".join(
        char for char in unicodedata.normalize("NFD", valeur.lower()) if unicodedata.category(char) != "Mn"
    )
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", sans_accents)).strip()


#: Mots trop courts ou trop communs pour indiquer qu'une question porte sur le
#: champ demandé. Filtrés avant la comparaison lexicale ci-dessous.
_MOTS_VIDES = {"est", "les", "des", "une", "aux", "pour", "avec", "dans", "vous"}


def _vocabulaire_du_champ(champ_cible: str) -> set[str]:
    """Les mots propres au champ interrogé, tirés de son nom technique.

    ``logement_conventionne`` → ``{"logement", "conventionne"}``. Sert à
    distinguer « conventionné ? » (question *sur ce champ*) de « quel temps
    fera-t-il demain ? » (question sans rapport).
    """
    mots = _normaliser(champ_cible.replace("_", " ")).split()
    return {mot for mot in mots if len(mot) >= 4 and mot not in _MOTS_VIDES}


def _est_demande_clarification(champ_cible: str, valeur: str) -> bool:
    """Le citoyen demande-t-il une explication *sur la question posée* ?

    Un point d'interrogation seul ne suffit pas. « Quel temps fera-t-il
    demain ? » est bien une question, mais pas une demande de clarification :
    la traiter comme telle renverrait l'explication du champ en cours à
    quelqu'un qui parlait d'autre chose. Deux signaux sont donc retenus :

    1. une tournure explicitement interrogative sur le sens (`_MOTS_CLARIFICATION`) ;
    2. un point d'interrogation *accompagné* d'un mot du champ interrogé.

    Tout le reste part en `hors_sujet`, qui repose la question sans prétendre
    répondre à ce qui n'a pas été demandé.
    """
    normalisee = _normaliser(valeur)
    if any(mot in normalisee for mot in _MOTS_CLARIFICATION):
        return True

    if "?" not in valeur:
        return False

    mots_saisis = set(normalisee.split())
    return bool(mots_saisis & _vocabulaire_du_champ(champ_cible))


def analyser_reponse(champ_cible: str, valeur_brute: str) -> AnalyseReponse:
    """Interprète une réponse citoyenne sans exiger de libellé exact.

    Les décisions de branche restent déterministes ; cette couche convertit
    uniquement une formulation naturelle en la valeur attendue du champ.
    """
    if _est_demande_clarification(champ_cible, valeur_brute) or (
        champ_cible == "logement_conventionne" and _normaliser(valeur_brute) in {"je ne sais pas", "ne sais pas"}
    ):
        return AnalyseReponse(
            type_reponse_percue=TypeReponsePercue.demande_clarification,
            valeur_extraite=None,
            message_si_clarification=_EXPLICATIONS.get(
                champ_cible,
                "Je peux vous aider : indiquez simplement la réponse qui correspond le mieux à votre situation.",
            ),
            repeter_meme_question=True,
        )
    try:
        valeur = convertir_reponse(champ_cible, valeur_brute)
    except ReponseInvalide:
        return AnalyseReponse(
            type_reponse_percue=TypeReponsePercue.hors_sujet,
            valeur_extraite=None,
            message_si_clarification=None,
            repeter_meme_question=True,
        )
    return AnalyseReponse(
        type_reponse_percue=TypeReponsePercue.reponse_valide,
        valeur_extraite=valeur.value if hasattr(valeur, "value") else valeur,
        message_si_clarification=None,
        repeter_meme_question=False,
    )


def convertir_reponse(champ_cible: str, valeur_brute: str):
    brut = str(valeur_brute).strip()
    cle = _normaliser(brut)

    def trouver_label(labels):
        labels_normalises = {_normaliser(libelle): valeur for libelle, valeur in labels.items()}
        if cle in labels_normalises:
            return labels_normalises[cle]
        for libelle, valeur in labels_normalises.items():
            if libelle in cle:
                return valeur
        return None

    if champ_cible == "situation_logement":
        valeur = trouver_label(_LOGEMENT_LABELS)
        if valeur is None:
            raise ReponseInvalide(f"Valeur inconnue pour situation_logement: {brut!r}")
        return valeur

    if champ_cible == "type_location":
        valeur = trouver_label(_LOCATION_LABELS)
        if valeur is None:
            raise ReponseInvalide(f"Valeur inconnue pour type_location: {brut!r}")
        return valeur

    if champ_cible == "statut_marital":
        valeur = trouver_label(_MARITAL_LABELS)
        if valeur is None:
            raise ReponseInvalide(f"Valeur inconnue pour statut_marital: {brut!r}")
        return valeur

    if champ_cible in ("statut_professionnel", "statut_professionnel_conjoint"):
        valeur = trouver_label(_STATUT_PRO_LABELS)
        if valeur is None:
            raise ReponseInvalide(f"Valeur inconnue pour {champ_cible}: {brut!r}")
        return valeur

    if champ_cible == "logement_conventionne" and cle in {"je ne sais pas", "ne sais pas"}:
        # Cas particulier : le citoyen ne sait pas si son logement est
        # conventionné. On ne force pas une réponse binaire arbitraire ;
        # l'appelant reçoit une erreur claire plutôt qu'un booléen halluciné.
        raise ReponseInvalide(
            "« Je ne sais pas » n'est pas exploitable pour ce champ — répondez Oui ou Non, "
            "ou consultez votre bail/l'attestation CAF."
        )

    if champ_cible in _CHAMPS_BOOLEENS:
        mots = set(cle.split())
        if cle in _NON or mots.intersection(_NON) or "pas de" in cle or "aucun" in cle:
            return False
        if cle in _OUI or mots.intersection(_OUI) or any(mot in cle for mot in ("je suis", "j ai", "je percois", "je touche")):
            return True
        raise ReponseInvalide(f"Réponse oui/non attendue, reçu: {brut!r}")

    if champ_cible in _CHAMPS_FLOTTANTS:
        nettoye = re.sub(r"[^\d,.\-]", "", brut).replace(",", ".")
        try:
            return float(nettoye)
        except ValueError as exc:
            raise ReponseInvalide(f"Nombre attendu, reçu: {brut!r}") from exc

    if champ_cible in _CHAMPS_ENTIERS:
        nettoye = re.sub(r"[^\d\-]", "", brut)
        try:
            if nettoye:
                return int(nettoye)
            for mot, valeur in _NOMBRES_FR.items():
                if mot in cle.split():
                    return valeur
            raise ValueError
        except ValueError as exc:
            raise ReponseInvalide(f"Entier attendu, reçu: {brut!r}") from exc

    # Champs texte libre (adresse, code_postal, ages_enfants, type_contrat,
    # type_residence_detail, situation_professionnelle, prenom, nom...)
    return brut
