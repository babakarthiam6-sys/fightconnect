"""Recherche de partenaires : filtres, visibilité, fiche publique."""

import pytest

from tests.conftest import make_partner, register


@pytest.mark.asyncio
async def test_un_profil_incomplet_n_apparait_pas_dans_la_recherche(client):
    """Un compte tout juste créé n'a ni discipline ni tarif : le proposer ferait
    perdre son temps à celui qui cherche, et le rendrait non réservable."""
    await register(client, email="vide@exemple.com", first_name="Vide")
    chercheur = await register(client, email="chercheur@exemple.com", first_name="Ana")

    response = await client.get("/api/v1/partners", headers=chercheur["headers"])

    assert response.status_code == 200
    assert response.json()["items"] == []


@pytest.mark.asyncio
async def test_un_partenaire_complet_apparait(client):
    await make_partner(client)
    chercheur = await register(client, email="chercheur@exemple.com", first_name="Ana")

    response = await client.get("/api/v1/partners", headers=chercheur["headers"])

    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["first_name"] == "Luis"
    assert body["items"][0]["price_per_round"] == 20


@pytest.mark.asyncio
async def test_on_ne_se_voit_pas_soi_meme_dans_la_recherche(client):
    """Se proposer à soi-même n'a pas de sens et occupe une place dans la liste."""
    luis = await make_partner(client)

    response = await client.get("/api/v1/partners", headers=luis["headers"])

    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_un_partenaire_indisponible_est_masque(client):
    luis = await make_partner(client)
    await client.patch("/api/v1/auth/me", json={"available": False}, headers=luis["headers"])
    chercheur = await register(client, email="chercheur@exemple.com", first_name="Ana")

    response = await client.get("/api/v1/partners", headers=chercheur["headers"])

    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_les_filtres_restreignent_la_liste(client):
    await make_partner(client, email="boxeur@exemple.com", first_name="Luis", style="boxing")
    await make_partner(client, email="mma@exemple.com", first_name="Maria", style="mma")
    chercheur = await register(client, email="chercheur@exemple.com", first_name="Ana")

    response = await client.get(
        "/api/v1/partners", params={"style": "mma"}, headers=chercheur["headers"]
    )

    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["first_name"] == "Maria"


@pytest.mark.asyncio
async def test_la_ville_se_cherche_par_prefixe_sans_casse(client):
    await make_partner(client, city="Valence")
    chercheur = await register(client, email="chercheur@exemple.com", first_name="Ana")

    response = await client.get(
        "/api/v1/partners", params={"city": "val"}, headers=chercheur["headers"]
    )

    assert response.json()["total"] == 1


@pytest.mark.asyncio
async def test_un_filtre_inconnu_est_refuse(client):
    """Une faute de frappe renverrait sinon zéro résultat, ce que l'utilisateur
    lirait comme « personne ne pratique ce sport »."""
    chercheur = await register(client, email="chercheur@exemple.com", first_name="Ana")

    response = await client.get(
        "/api/v1/partners", params={"style": "sumo"}, headers=chercheur["headers"]
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_la_fiche_publique_ne_divulgue_pas_l_email(client):
    luis = await make_partner(client)
    chercheur = await register(client, email="chercheur@exemple.com", first_name="Ana")

    response = await client.get(
        f"/api/v1/partners/{luis['user']['id']}", headers=chercheur["headers"]
    )

    body = response.json()
    assert response.status_code == 200
    assert "email" not in body
    assert body["fights_count"] == 15


@pytest.mark.asyncio
async def test_se_rendre_disponible_sans_tarif_est_refuse(client):
    """Une fiche sans tarif ni discipline n'est ni filtrable ni réservable."""
    compte = await register(client, email="nu@exemple.com", first_name="Nu")

    response = await client.patch(
        "/api/v1/auth/me", json={"available": True}, headers=compte["headers"]
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_la_fiche_dit_si_le_partenaire_peut_etre_paye(client, database):
    """L'écran de réservation doit prévenir avant que la demande ne parte.

    Sans cette information sur la fiche publique, le blocage n'arrive qu'au
    moment de payer : la demande est déjà envoyée, déjà acceptée, et c'est le
    pire moment pour l'apprendre.
    """
    luis = await make_partner(client)
    chercheur = await register(client, email="chercheur@exemple.com", first_name="Ana")

    avant = await client.get(
        f"/api/v1/partners/{luis['user']['id']}", headers=chercheur["headers"]
    )
    assert avant.status_code == 200
    assert avant.json()["payouts_enabled"] is False

    await database.users.update_one(
        {"email": "luis@exemple.com"}, {"$set": {"stripe_payouts_enabled": True}}
    )

    apres = await client.get(
        f"/api/v1/partners/{luis['user']['id']}", headers=chercheur["headers"]
    )
    assert apres.json()["payouts_enabled"] is True


@pytest.mark.asyncio
async def test_la_fiche_publique_ne_laisse_pas_passer_l_email(client):
    """Le champ ajouté ci-dessus ne doit pas avoir ouvert la porte au reste."""
    luis = await make_partner(client)
    chercheur = await register(client, email="chercheur@exemple.com", first_name="Ana")

    fiche = await client.get(
        f"/api/v1/partners/{luis['user']['id']}", headers=chercheur["headers"]
    )

    corps = fiche.json()
    assert "email" not in corps
    assert "luis@exemple.com" not in fiche.text
    assert "expo_push_token" not in corps
    assert "discharge_accepted" not in corps
