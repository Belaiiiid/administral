"""Ce qui empêche un script de vider le budget et d'emporter l'API avec lui.

`POST /citizen/chatbot/message` est public par choix produit, et chaque tour
coûte un ou deux appels facturés. Rien ne bornait le débit ni la dépense. Comme
chaque requête occupe plusieurs secondes un worker du pool, le même script qui
vidait le budget rendait aussi toute l'API muette.

Deux bornes, à deux étages, parce qu'elles n'arrêtent pas la même chose :

- le QUOTA par appelant borne ce qu'une personne peut demander ;
- le BUDGET global borne le total, que mille appelants dans leur droit
  atteindraient sans jamais dépasser leur propre quota.

Le point vérifié partout ici : une requête refusée ne coûte RIEN. Pas d'appel au
modèle, pas de worker retenu.
"""

from __future__ import annotations

import json

import pytest

from app.core.rate_limit import LimiteurMemoire, Quota, RateLimitExceeded
from app.modules.chatbot import quotas, service
from app.modules.chatbot.rag import budget


@pytest.fixture(autouse=True)
def compteurs_vierges():
    quotas.reinitialiser()
    budget.reinitialiser()
    yield
    quotas.reinitialiser()
    budget.reinitialiser()


# --- Le limiteur lui-même -----------------------------------------------------


def test_le_quota_par_minute_arrete_le_martelage():
    limiteur, quota = LimiteurMemoire(), Quota(par_minute=3, par_jour=100)
    for _ in range(3):
        limiteur.verifier("ip:1.2.3.4", quota, maintenant=1000.0)
    with pytest.raises(RateLimitExceeded):
        limiteur.verifier("ip:1.2.3.4", quota, maintenant=1000.0)


def test_la_fenetre_glisse_vraiment():
    """Une fenêtre FIXE laisserait passer deux fois le quota à cheval sur sa
    frontière. Ici la minute écoulée libère exactement ce qu'elle contenait."""
    limiteur, quota = LimiteurMemoire(), Quota(par_minute=2, par_jour=100)
    limiteur.verifier("ip:1.2.3.4", quota, maintenant=1000.0)
    limiteur.verifier("ip:1.2.3.4", quota, maintenant=1030.0)
    with pytest.raises(RateLimitExceeded):
        limiteur.verifier("ip:1.2.3.4", quota, maintenant=1050.0)
    limiteur.verifier("ip:1.2.3.4", quota, maintenant=1061.0)  # la 1re est sortie


def test_le_quota_par_jour_arrete_le_rythme_discret():
    """Un script lent respecte la borne par minute indéfiniment ; c'est la borne
    quotidienne qui l'arrête."""
    limiteur, quota = LimiteurMemoire(), Quota(par_minute=100, par_jour=5)
    for i in range(5):
        limiteur.verifier("ip:1.2.3.4", quota, maintenant=1000.0 + i * 300)
    with pytest.raises(RateLimitExceeded):
        limiteur.verifier("ip:1.2.3.4", quota, maintenant=1000.0 + 5 * 300)


def test_un_appel_refuse_ne_repousse_pas_la_fenetre():
    """Sinon un client qui insiste se punirait lui-même bien au-delà de la minute
    annoncée — une sanction que le quota n'a jamais promise."""
    limiteur, quota = LimiteurMemoire(), Quota(par_minute=1, par_jour=100)
    limiteur.verifier("ip:1.2.3.4", quota, maintenant=1000.0)
    for instant in (1010.0, 1020.0, 1030.0):
        with pytest.raises(RateLimitExceeded):
            limiteur.verifier("ip:1.2.3.4", quota, maintenant=instant)
    limiteur.verifier("ip:1.2.3.4", quota, maintenant=1061.0)


def test_les_appelants_sont_comptes_separement():
    limiteur, quota = LimiteurMemoire(), Quota(par_minute=1, par_jour=10)
    limiteur.verifier("ip:1.1.1.1", quota, maintenant=1000.0)
    limiteur.verifier("ip:2.2.2.2", quota, maintenant=1000.0)  # ne doit pas lever


def test_le_refus_porte_un_429():
    assert RateLimitExceeded.status_code == 429


# --- La politique : qui est l'appelant ---------------------------------------


class _FausseRequete:
    def __init__(self, ip="10.0.0.1", entetes=None):
        self.client = type("C", (), {"host": ip})()
        self.headers = entetes or {}


class _FauxUser:
    id = 42


def test_un_compte_est_compte_sur_son_compte_pas_son_ip():
    """Meilleure clé disponible : elle survit à un changement de réseau."""
    cle, quota = quotas.appelant(_FausseRequete(), _FauxUser())
    assert cle == "compte:42"
    assert quota is quotas.QUOTA_CONNECTE


def test_un_visiteur_anonyme_est_compte_sur_son_ip():
    cle, quota = quotas.appelant(_FausseRequete("203.0.113.7"), None)
    assert cle == "ip:203.0.113.7"
    assert quota is quotas.QUOTA_ANONYME


def test_len_tete_transmise_est_ignoree_sans_reglage_explicite(monkeypatch):
    """`X-Forwarded-For` s'écrit à la main : le croire sans proxy devant, c'est
    offrir un quota neuf à chaque requête."""
    monkeypatch.setattr(quotas, "_DERRIERE_UN_PROXY", False)
    requete = _FausseRequete("10.0.0.1", {"x-forwarded-for": "1.1.1.1"})
    assert quotas.appelant(requete, None)[0] == "ip:10.0.0.1"


def test_len_tete_transmise_est_lue_quand_le_deploiement_le_declare(monkeypatch):
    """L'erreur inverse est aussi réelle : derrière un proxy sans ce réglage, tout
    le monde porte l'IP du proxy et se bloque mutuellement."""
    monkeypatch.setattr(quotas, "_DERRIERE_UN_PROXY", True)
    requete = _FausseRequete("10.0.0.1", {"x-forwarded-for": "1.1.1.1, 10.0.0.9"})
    assert quotas.appelant(requete, None)[0] == "ip:1.1.1.1"


def test_le_quota_anonyme_est_plus_serre_que_le_quota_connecte():
    assert quotas.QUOTA_ANONYME.par_minute <= quotas.QUOTA_CONNECTE.par_minute
    assert quotas.QUOTA_ANONYME.par_jour <= quotas.QUOTA_CONNECTE.par_jour


def test_le_quota_anonyme_laisse_place_a_de_vraies_conversations():
    """Un entretien « documents » fait cinq tours à lui seul : la borne vise le
    script, pas le citoyen."""
    assert quotas.QUOTA_ANONYME.par_minute >= 5
    assert quotas.QUOTA_ANONYME.par_jour >= 20


# --- Le disjoncteur de dépense ------------------------------------------------


def test_sans_budget_configure_rien_nest_suspendu(monkeypatch):
    """On n'arrête pas un service sur une valeur que personne n'a choisie."""
    monkeypatch.setattr(budget, "BUDGET_JETONS_PAR_JOUR", 0)
    budget.enregistrer(1_000_000, 1_000_000, "mistral-small-latest")
    assert budget.depasse() is False


def test_le_disjoncteur_saute_au_dela_du_budget(monkeypatch):
    monkeypatch.setattr(budget, "BUDGET_JETONS_PAR_JOUR", 1000)
    budget.enregistrer(400, 300, "m")
    assert budget.depasse() is False
    budget.enregistrer(200, 200, "m")
    assert budget.depasse() is True


def test_le_depassement_nest_signale_quune_fois(monkeypatch, capsys):
    """À chaque requête, l'incident se noierait dans son propre bruit."""
    monkeypatch.setattr(budget, "BUDGET_JETONS_PAR_JOUR", 10)
    budget.enregistrer(20, 0, "m")
    capsys.readouterr()

    for _ in range(5):
        budget.depasse()

    erreurs = [
        l for l in capsys.readouterr().err.splitlines()
        if "budget de jetons" in l
    ]
    assert len(erreurs) == 1


def test_la_consommation_de_chaque_appel_est_consignee(capsys):
    """Sans ce chiffre, un budget ne peut être fixé qu'au jugé."""
    budget.enregistrer(120, 80, "mistral-small-latest")
    ligne = [
        json.loads(l) for l in capsys.readouterr().out.splitlines()
        if l.startswith("{") and "appel au modèle" in l
    ][0]
    assert ligne["context"]["jetons_entree"] == 120
    assert ligne["context"]["jetons_sortie"] == 80
    assert ligne["context"]["jetons_jour"] == 200
    assert ligne["context"]["modele"] == "mistral-small-latest"


def test_budget_epuise_le_moteur_nest_meme_pas_appele(monkeypatch):
    """Le point de tout l'exercice : dépassé le budget, on cesse de payer."""
    monkeypatch.setattr(budget, "BUDGET_JETONS_PAR_JOUR", 10)
    budget.enregistrer(50, 0, "m")

    def interdit():
        raise AssertionError("le moteur ne doit pas être invoqué")

    monkeypatch.setattr(service, "_get_graph", interdit)

    reponse = service.answer_question("quels documents ?", None, None)
    assert "momentanément indisponible" in reponse.answer


# --- Au niveau du endpoint ----------------------------------------------------


def test_le_endpoint_refuse_avant_datteindre_le_moteur(monkeypatch):
    """Le critère qui compte : une requête au-delà du quota ne doit RIEN coûter — ni un
    appel facturé, ni un worker occupé plusieurs secondes."""
    from app.modules.chatbot import router as chatbot_router
    from app.modules.chatbot.schemas import ChatbotRequestSchema, ChatbotResponseSchema

    appels_moteur = []

    def faux_service(message, context, user):
        appels_moteur.append(message)
        return ChatbotResponseSchema(answer="ok", sources=[])

    monkeypatch.setattr(chatbot_router.service, "answer_question", faux_service)
    monkeypatch.setattr(chatbot_router.history, "record_turn", lambda *a, **k: None)
    monkeypatch.setattr(quotas, "QUOTA_ANONYME", Quota(par_minute=2, par_jour=10))

    requete = _FausseRequete("198.51.100.5")
    body = ChatbotRequestSchema(message="quels documents ?")

    for _ in range(2):
        chatbot_router.send_message(requete, body, None)
    assert len(appels_moteur) == 2

    with pytest.raises(RateLimitExceeded):
        chatbot_router.send_message(requete, body, None)
    assert len(appels_moteur) == 2, "la requête refusée n'a pas atteint le moteur"


def test_un_quota_atteint_est_consigne(monkeypatch, capsys):
    """En `warn`, pas en `error` : le système fait son travail. C'est la fréquence qui
    informe — un abus, un client qui boucle, ou des bornes trop serrées pour l'usage."""
    monkeypatch.setattr(quotas, "QUOTA_ANONYME", Quota(par_minute=1, par_jour=5))
    requete = _FausseRequete("198.51.100.9")

    quotas.verifier(requete, None)
    capsys.readouterr()

    with pytest.raises(RateLimitExceeded):
        quotas.verifier(requete, None)

    lignes = [
        json.loads(l) for l in capsys.readouterr().err.splitlines() if l.startswith("{")
    ]
    quota_atteint = [l for l in lignes if "quota atteint" in l["message"]]
    assert len(quota_atteint) == 1
    assert quota_atteint[0]["level"] == "warn"
    assert quota_atteint[0]["context"]["appelant"] == "ip:198.51.100.9"


def test_letat_du_budget_est_lisible_pour_la_supervision(monkeypatch):
    monkeypatch.setattr(budget, "BUDGET_JETONS_PAR_JOUR", 100)
    budget.enregistrer(30, 20, "m")
    etat = budget.etat()
    assert etat["jetons_jour"] == 50
    assert etat["appels_jour"] == 1
    assert etat["suspendu"] is False
