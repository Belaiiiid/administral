"""
A2 — Schéma profil_partiel

Étendu pour porter la logique en cascade fournie par l'utilisateur (statut
socio-professionnel, situation familiale détaillée, catégories de logement).
Toutes les valeurs métier restent Optional : le profil est par définition
PARTIEL tant que evaluer_completude_profil() ne renvoie pas True (A4).

⚠️ Changement de contrat par rapport à la version précédente (signalé
conformément à RULES.md §2.5 / §6) :
- `est_etudiant` (bool) est remplacé par `statut_professionnel` (enum à 5
  valeurs). `est_boursier` reste, mais n'est pertinent que si
  `statut_professionnel == etudiant`.
- `type_location` gagne la valeur `sous_location`.
- De nombreux champs sont ajoutés (revenus par statut, conjoint, enfants,
  logement) — chacun commenté avec la branche de la cascade métier qui le
  requiert.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class StatutLogement(str, Enum):
    locataire = "locataire"
    proprietaire = "proprietaire"
    heberge = "heberge"


class StatutMarital(str, Enum):
    celibataire = "celibataire"
    marie = "marie"
    pacse = "pacse"
    concubinage = "concubinage"


class TypeLocation(str, Enum):
    vide = "vide"  # non meublée
    meublee = "meublee"
    colocation = "colocation"
    chambre = "chambre"
    sous_location = "sous_location"
    residence_etudiante = "residence_etudiante"  # CROUS / résidence privée / EHPAD


class StatutProfessionnel(str, Enum):
    etudiant = "etudiant"
    apprenti_alternant = "apprenti_alternant"
    salarie = "salarie"
    demandeur_emploi = "demandeur_emploi"
    independant = "independant"


class ProfilPartiel(BaseModel):
    """État incrémental du profil citoyen — un champ à la fois, jamais écrasé."""

    model_config = {"validate_assignment": True, "extra": "forbid"}

    # --- Identité (renseignée à l'inscription, hors boucle LLM — cf A1/onboarding) ---
    prenom: Optional[str] = None
    nom: Optional[str] = None
    email: Optional[str] = None

    # --- Logement ---
    situation_logement: Optional[StatutLogement] = None
    type_location: Optional[TypeLocation] = None
    loyer_mensuel: Optional[float] = Field(default=None, ge=0)
    surface_m2: Optional[float] = Field(default=None, ge=0)
    code_postal: Optional[str] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    # Exclusion légale (service-public.gouv.fr F12006) : pas d'APL si le bailleur
    # est un ascendant/descendant du demandeur ou de son conjoint.
    logement_appartient_a_un_proche: Optional[bool] = None
    # Branche "Locataire" : logement conventionné (condition d'éligibilité).
    logement_conventionne: Optional[bool] = None
    # Branche "Sous-locataire" : conditions d'âge et de déclaration.
    moins_de_30_ans: Optional[bool] = None
    sous_location_declaree: Optional[bool] = None
    # Branche "Foyer / Résidence" (CROUS, EHPAD...) : la redevance remplace le loyer.
    type_residence_detail: Optional[str] = None
    redevance_mensuelle: Optional[float] = Field(default=None, ge=0)

    # --- Composition familiale ---
    statut_marital: Optional[StatutMarital] = None
    # Gate explicite : le nombre ne peut être demandé qu'après cette réponse.
    a_des_enfants_a_charge: Optional[bool] = None
    nombre_enfants_a_charge: Optional[int] = Field(default=None, ge=0)
    nombre_adultes_rattaches: Optional[int] = Field(default=None, ge=0)
    # Branche "enfant(s) à charge" : âge(s) et pension alimentaire.
    ages_enfants: Optional[str] = None
    percoit_pension_alimentaire: Optional[bool] = None
    montant_pension_alimentaire: Optional[float] = Field(default=None, ge=0)
    # Branche "en couple" : statut pro + revenus du conjoint.
    statut_professionnel_conjoint: Optional[StatutProfessionnel] = None
    revenus_conjoint_mensuels: Optional[float] = Field(default=None, ge=0)

    # --- Statut socio-professionnel et ressources ---
    statut_professionnel: Optional[StatutProfessionnel] = None
    revenu_fiscal_reference: Optional[float] = Field(default=None, ge=0)
    situation_professionnelle: Optional[str] = None
    # Étudiant
    est_boursier: Optional[bool] = None
    montant_bourse: Optional[float] = Field(default=None, ge=0)
    # Apprenti/alternant ou salarié
    type_contrat: Optional[str] = None
    revenus_nets_mensuels: Optional[float] = Field(default=None, ge=0)
    # Demandeur d'emploi
    percoit_are: Optional[bool] = None
    montant_are_mensuel: Optional[float] = Field(default=None, ge=0)
    # Indépendant
    chiffre_affaires_annuel: Optional[float] = Field(default=None, ge=0)

    # --- Méta ---
    derniere_maj: Optional[datetime] = None

    @field_validator("code_postal")
    @classmethod
    def _valider_code_postal(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and (not v.isdigit() or len(v) != 5):
            raise ValueError("code_postal doit contenir exactement 5 chiffres")
        return v


# Champs pris en compte par l'agent de profilage (identité et métier)
CHAMPS_PROFILAGE = [
    name
    for name in ProfilPartiel.model_fields
    if name not in {"derniere_maj"}
]


class ProfilPatch(BaseModel):
    """Corps de requête pour PATCH /session/{id}/profil — un ou plusieurs champs à la fois."""

    model_config = {"extra": "forbid"}

    prenom: Optional[str] = None
    nom: Optional[str] = None
    email: Optional[str] = None
    situation_logement: Optional[StatutLogement] = None
    type_location: Optional[TypeLocation] = None
    loyer_mensuel: Optional[float] = Field(default=None, ge=0)
    surface_m2: Optional[float] = Field(default=None, ge=0)
    code_postal: Optional[str] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    logement_appartient_a_un_proche: Optional[bool] = None
    logement_conventionne: Optional[bool] = None
    moins_de_30_ans: Optional[bool] = None
    sous_location_declaree: Optional[bool] = None
    type_residence_detail: Optional[str] = None
    redevance_mensuelle: Optional[float] = Field(default=None, ge=0)
    statut_marital: Optional[StatutMarital] = None
    a_des_enfants_a_charge: Optional[bool] = None
    nombre_enfants_a_charge: Optional[int] = Field(default=None, ge=0)
    nombre_adultes_rattaches: Optional[int] = Field(default=None, ge=0)
    ages_enfants: Optional[str] = None
    percoit_pension_alimentaire: Optional[bool] = None
    montant_pension_alimentaire: Optional[float] = Field(default=None, ge=0)
    statut_professionnel_conjoint: Optional[StatutProfessionnel] = None
    revenus_conjoint_mensuels: Optional[float] = Field(default=None, ge=0)
    statut_professionnel: Optional[StatutProfessionnel] = None
    revenu_fiscal_reference: Optional[float] = Field(default=None, ge=0)
    situation_professionnelle: Optional[str] = None
    est_boursier: Optional[bool] = None
    montant_bourse: Optional[float] = Field(default=None, ge=0)
    type_contrat: Optional[str] = None
    revenus_nets_mensuels: Optional[float] = Field(default=None, ge=0)
    percoit_are: Optional[bool] = None
    montant_are_mensuel: Optional[float] = Field(default=None, ge=0)
    chiffre_affaires_annuel: Optional[float] = Field(default=None, ge=0)
