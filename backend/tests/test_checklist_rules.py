"""The deterministic checklist generator — the profile → documents rules.

DB-free, like the rest of the suite: the generator is a pure function, which is
the whole point (the LLM does not decide required documents, and the same
profile must always yield the same, explainable checklist). These lock in the
mapping so a rule change is a visible diff, not a silent regression.
"""

from __future__ import annotations

from app.features.citizen.profiling.schemas.profil import (
    ProfilPartiel,
    StatutLogement,
    StatutMarital,
    StatutProfessionnel,
    TypeLocation,
)
from app.modules.citizen.checklist_rules import generate_personalized_checklist

#: The universal core, required of every applicant whatever the profile.
CORE = {"piece_identite", "justificatif_domicile", "avis_imposition", "releve_identite_bancaire"}


def _keys(profil: ProfilPartiel) -> set[str]:
    return {item.item_key for item in generate_personalized_checklist(profil)}


def _by_key(profil: ProfilPartiel) -> dict[str, object]:
    return {item.item_key: item for item in generate_personalized_checklist(profil)}


def test_blank_profile_yields_only_the_core() -> None:
    assert _keys(ProfilPartiel()) == CORE


def test_generation_is_deterministic() -> None:
    profil = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        statut_professionnel=StatutProfessionnel.salarie,
    )
    first = generate_personalized_checklist(profil)
    second = generate_personalized_checklist(profil)
    assert [i.item_key for i in first] == [i.item_key for i in second]


def test_every_item_has_a_reason() -> None:
    # "Explainable" is a hard requirement: no item may be asked without a why.
    profil = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        statut_professionnel=StatutProfessionnel.etudiant,
        est_boursier=True,
    )
    for item in generate_personalized_checklist(profil):
        assert item.justification.strip()


def test_core_is_always_present() -> None:
    profil = ProfilPartiel(
        situation_logement=StatutLogement.proprietaire,
        statut_professionnel=StatutProfessionnel.independant,
    )
    assert CORE <= _keys(profil)


def test_tenant_needs_a_lease() -> None:
    keys = _keys(ProfilPartiel(situation_logement=StatutLogement.locataire))
    assert "contrat_location" in keys
    assert "attestation_loyer" in keys  # optional, but expected


def test_student_residence_replaces_the_lease() -> None:
    keys = _keys(
        ProfilPartiel(
            situation_logement=StatutLogement.locataire,
            type_location=TypeLocation.residence_etudiante,
        )
    )
    assert "attestation_residence" in keys
    assert "contrat_location" not in keys


def test_owner_needs_the_loan_schedule_not_a_lease() -> None:
    keys = _keys(ProfilPartiel(situation_logement=StatutLogement.proprietaire))
    assert "tableau_amortissement_pret" in keys
    assert "contrat_location" not in keys


def test_hosted_needs_a_hosting_certificate() -> None:
    keys = _keys(ProfilPartiel(situation_logement=StatutLogement.heberge))
    assert "attestation_hebergement" in keys


def test_employee_needs_payslips() -> None:
    assert "bulletins_salaire_3_derniers_mois" in _keys(
        ProfilPartiel(statut_professionnel=StatutProfessionnel.salarie)
    )


def test_scholarship_student_needs_the_award_notice() -> None:
    keys = _keys(
        ProfilPartiel(statut_professionnel=StatutProfessionnel.etudiant, est_boursier=True)
    )
    assert "certificat_scolarite" in keys
    assert "notification_bourse" in keys
    # A non-scholarship student does not get the award notice.
    assert "notification_bourse" not in _keys(
        ProfilPartiel(statut_professionnel=StatutProfessionnel.etudiant, est_boursier=False)
    )


def test_jobseeker_with_are_needs_the_allowance_proof() -> None:
    keys = _keys(
        ProfilPartiel(statut_professionnel=StatutProfessionnel.demandeur_emploi, percoit_are=True)
    )
    assert "attestation_france_travail" in keys
    assert "justificatif_are" in keys


def test_children_and_pension_add_family_documents() -> None:
    keys = _keys(
        ProfilPartiel(a_des_enfants_a_charge=True, percoit_pension_alimentaire=True)
    )
    assert "livret_famille" in keys
    assert "justificatif_pension_alimentaire" in keys


def test_married_needs_livret_de_famille_once_only() -> None:
    # Married *and* with children must not duplicate the livret de famille.
    profil = ProfilPartiel(statut_marital=StatutMarital.marie, a_des_enfants_a_charge=True)
    items = generate_personalized_checklist(profil)
    keys = [i.item_key for i in items]
    assert keys.count("livret_famille") == 1


def test_working_partner_adds_partner_income() -> None:
    assert "justificatif_revenus_conjoint" in _keys(
        ProfilPartiel(
            statut_marital=StatutMarital.marie,
            statut_professionnel_conjoint=StatutProfessionnel.salarie,
        )
    )


def test_item_keys_are_unique() -> None:
    profil = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        statut_professionnel=StatutProfessionnel.apprenti_alternant,
        statut_marital=StatutMarital.pacse,
        a_des_enfants_a_charge=True,
        percoit_pension_alimentaire=True,
        statut_professionnel_conjoint=StatutProfessionnel.salarie,
    )
    keys = [i.item_key for i in generate_personalized_checklist(profil)]
    assert len(keys) == len(set(keys))
