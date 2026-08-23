"""Ce qui permet à l'application de sortir de France.

Pays au profil et à la recherche, devise choisie par le partenaire, et
conversion des montants dans la plus petite unité de chaque devise.
"""

import pytest

from app.services.payments import to_minor_units
from tests.conftest import make_partner, register


@pytest.mark.asyncio
async def test_le_pays_se_declare_et_se_relit(client):
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.patch(
        "/api/v1/auth/me", json={"country": "sn"}, headers=ana["headers"]
    )

    assert response.status_code == 200
    # Le code est ramené à sa forme canonique : « sn » saisi, « SN » stocké.
    assert response.json()["country"] == "SN"


@pytest.mark.asyncio
async def test_un_pays_inventé_est_refusé(client):
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.patch(
        "/api/v1/auth/me", json={"country": "ZZ"}, headers=ana["headers"]
    )

    assert response.status_code == 422
    assert "ZZ" in response.json()["detail"]


@pytest.mark.asyncio
async def test_declarer_son_pays_propose_la_devise_du_lieu(client):
    """Un boxeur à Londres ne devrait pas corriger « EUR » à la main."""
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.patch(
        "/api/v1/auth/me", json={"country": "GB"}, headers=ana["headers"]
    )

    assert response.json()["currency"] == "GBP"


@pytest.mark.asyncio
async def test_une_devise_choisie_n_est_jamais_écrasée(client):
    """Le pays propose, il n'impose pas : un expatrié facture comme il veut."""
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await client.patch(
        "/api/v1/auth/me",
        json={"currency": "USD", "price_per_round": 30},
        headers=ana["headers"],
    )

    response = await client.patch(
        "/api/v1/auth/me", json={"country": "FR"}, headers=ana["headers"]
    )

    assert response.json()["currency"] == "USD"


@pytest.mark.asyncio
async def test_une_devise_non_prise_en_charge_est_refusée(client):
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.patch(
        "/api/v1/auth/me", json={"currency": "XYZ"}, headers=ana["headers"]
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_la_recherche_se_limite_au_pays(client):
    """Sans pays, « Paris » ramène la France et le Texas dans la même liste."""
    await make_partner(client, email="fr@exemple.com", first_name="Luc", city="Paris", country="FR")
    await make_partner(client, email="us@exemple.com", first_name="John", city="Paris", country="US")
    chercheur = await register(client, email="ana@exemple.com", first_name="Ana")

    sans_pays = await client.get("/api/v1/partners?city=Paris", headers=chercheur["headers"])
    assert sans_pays.json()["total"] == 2

    en_france = await client.get(
        "/api/v1/partners?city=Paris&country=FR", headers=chercheur["headers"]
    )
    assert en_france.json()["total"] == 1
    assert en_france.json()["items"][0]["first_name"] == "Luc"


@pytest.mark.asyncio
async def test_un_pays_inconnu_en_filtre_est_refusé(client):
    chercheur = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.get("/api/v1/partners?country=ZZ", headers=chercheur["headers"])

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_la_demande_reprend_la_devise_du_partenaire(client):
    luis = await make_partner(client, country="JP", currency="JPY", price_per_round=3000)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    from tests.conftest import booking_payload

    response = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"], rounds=2),
        headers=ana["headers"],
    )

    corps = response.json()
    assert corps["currency"] == "JPY"
    assert corps["total"] == 6000
    assert corps["commission"] == 900
    assert corps["payout"] == 5100


class TestPlusPetiteUnite:
    """Multiplier par cent sans regarder la devise facturerait mille yens
    cent mille. C'est le genre d'erreur qui ne se voit qu'une fois l'argent
    parti."""

    def test_une_devise_à_centimes(self):
        assert to_minor_units(40, "EUR") == 4000
        assert to_minor_units(6.5, "usd") == 650

    def test_une_devise_sans_subdivision(self):
        assert to_minor_units(3000, "JPY") == 3000
        assert to_minor_units(15000, "XOF") == 15000
        assert to_minor_units(15000, "XAF") == 15000

    def test_une_devise_à_trois_décimales_reste_multiple_de_dix(self):
        # Stripe exige que le dernier chiffre soit à zéro pour ces devises.
        assert to_minor_units(25, "TND") == 25000
        assert to_minor_units(25.125, "KWD") % 10 == 0

    def test_une_devise_absente_retombe_sur_les_centimes(self):
        assert to_minor_units(10, "ZZZ") == 1000


@pytest.mark.asyncio
async def test_le_plafond_du_tarif_suit_la_devise(client):
    """Mille francs CFA valent moins de deux euros : le même plafond pour tous
    interdirait tout tarif crédible en Afrique de l'Ouest ou au Japon."""
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await client.patch("/api/v1/auth/me", json={"currency": "XOF"}, headers=ana["headers"])

    accepte = await client.patch(
        "/api/v1/auth/me", json={"price_per_round": 15000}, headers=ana["headers"]
    )
    assert accepte.status_code == 200

    refuse = await client.patch(
        "/api/v1/auth/me", json={"price_per_round": 500_000}, headers=ana["headers"]
    )
    assert refuse.status_code == 422


@pytest.mark.asyncio
async def test_le_plafond_en_euros_ne_bouge_pas(client):
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    refuse = await client.patch(
        "/api/v1/auth/me", json={"price_per_round": 1500}, headers=ana["headers"]
    )

    assert refuse.status_code == 422
    assert "1000" in refuse.json()["detail"]


class TestLangueDuServeur:
    """Les messages suivent l'en-tête `Accept-Language`."""

    @pytest.mark.asyncio
    async def test_le_français_reste_la_valeur_par_défaut(self, client):
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "personne@exemple.com", "password": "MotDePasse1"},
        )
        assert response.json()["detail"] == "Email ou mot de passe incorrect."

    @pytest.mark.asyncio
    async def test_l_anglais_est_servi_quand_il_est_demandé(self, client):
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "personne@exemple.com", "password": "MotDePasse1"},
            headers={"Accept-Language": "en-US,en;q=0.9"},
        )
        assert response.json()["detail"] == "Incorrect email or password."

    @pytest.mark.asyncio
    async def test_une_variante_régionale_est_reconnue(self, client):
        """« fr-CH » doit être lu comme du français, sans énumérer les variantes."""
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "personne@exemple.com", "password": "MotDePasse1"},
            headers={"Accept-Language": "fr-CH,fr;q=0.9"},
        )
        assert response.json()["detail"] == "Email ou mot de passe incorrect."

    @pytest.mark.asyncio
    async def test_une_langue_inconnue_retombe_sur_le_français(self, client):
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "personne@exemple.com", "password": "MotDePasse1"},
            headers={"Accept-Language": "de-DE,de"},
        )
        assert response.json()["detail"] == "Email ou mot de passe incorrect."

    @pytest.mark.asyncio
    async def test_la_langue_ne_déborde_pas_d_une_requête_sur_la_suivante(self, client):
        """La langue vit dans une variable de contexte, partagée par le processus.

        Mal posée, elle resterait à l'anglais pour tout le monde après une seule
        requête anglophone. C'est le risque propre à ce mécanisme, et la seule
        raison de ce test.
        """
        await client.post(
            "/api/v1/auth/login",
            json={"email": "personne@exemple.com", "password": "MotDePasse1"},
            headers={"Accept-Language": "en"},
        )

        suivante = await client.post(
            "/api/v1/auth/login",
            json={"email": "personne@exemple.com", "password": "MotDePasse1"},
        )
        assert suivante.json()["detail"] == "Email ou mot de passe incorrect."

    @pytest.mark.asyncio
    async def test_un_message_à_paramètre_se_traduit_aussi(self, client):
        ana = await register(client, email="ana@exemple.com", first_name="Ana")

        response = await client.patch(
            "/api/v1/auth/me",
            json={"country": "ZZ"},
            headers={**ana["headers"], "Accept-Language": "en"},
        )

        assert response.json()["detail"] == "Unknown country: ZZ."
