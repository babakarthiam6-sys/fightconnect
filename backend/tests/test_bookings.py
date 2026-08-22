"""Demandes de sparring : décompte, cycle de vie, droits de chacun."""

import pytest

from tests.conftest import booking_payload, make_partner, register


async def _demande(client, requester, partner_id, **overrides):
    response = await client.post(
        "/api/v1/bookings",
        json=booking_payload(partner_id, **overrides),
        headers=requester["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_le_total_est_le_tarif_multiplie_par_les_rounds(client):
    """Le décompte affiché à l'écran doit être celui que le serveur applique."""
    luis = await make_partner(client, price_per_round=20)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    booking = await _demande(client, ana, luis["user"]["id"], rounds=2)

    assert booking["total"] == 40
    assert booking["rounds"] == 2
    assert booking["price_per_round"] == 20


@pytest.mark.asyncio
async def test_la_commission_est_prelevee_sur_la_part_du_partenaire(client):
    """Elle ne s'ajoute pas au total : un supplément découvert au moment de payer
    est la première cause d'abandon d'une réservation."""
    luis = await make_partner(client, price_per_round=20)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    booking = await _demande(client, ana, luis["user"]["id"], rounds=2)

    assert booking["total"] == 40
    assert booking["commission"] + booking["payout"] == pytest.approx(booking["total"])
    assert booking["payout"] < booking["total"]


@pytest.mark.asyncio
async def test_on_ne_peut_pas_se_reserver_soi_meme(client):
    luis = await make_partner(client)

    response = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"]),
        headers=luis["headers"],
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_une_date_passee_est_refusee(client):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"], scheduled_at="2020-01-01T10:00:00+00:00"),
        headers=ana["headers"],
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_un_double_envoi_ne_cree_pas_deux_demandes(client):
    """Un double appui sur « Envoyer » ne doit pas engager deux fois la personne."""
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    premiere = await _demande(client, ana, luis["user"]["id"])
    seconde = await _demande(client, ana, luis["user"]["id"])

    assert premiere["id"] == seconde["id"]

    liste = await client.get(
        "/api/v1/bookings", params={"direction": "sent"}, headers=ana["headers"]
    )
    assert liste.json()["total"] == 1


@pytest.mark.asyncio
async def test_reçues_et_envoyées_ne_montrent_pas_la_même_chose(client):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await _demande(client, ana, luis["user"]["id"])

    envoyees = await client.get(
        "/api/v1/bookings", params={"direction": "sent"}, headers=ana["headers"]
    )
    recues = await client.get(
        "/api/v1/bookings", params={"direction": "received"}, headers=luis["headers"]
    )
    rien = await client.get(
        "/api/v1/bookings", params={"direction": "received"}, headers=ana["headers"]
    )

    assert envoyees.json()["total"] == 1
    assert recues.json()["total"] == 1
    assert rien.json()["total"] == 0


@pytest.mark.asyncio
async def test_seul_le_partenaire_accepte(client):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    booking = await _demande(client, ana, luis["user"]["id"])

    refus = await client.post(
        f"/api/v1/bookings/{booking['id']}/accept", headers=ana["headers"]
    )
    accord = await client.post(
        f"/api/v1/bookings/{booking['id']}/accept", headers=luis["headers"]
    )

    assert refus.status_code == 403
    assert accord.status_code == 200
    assert accord.json()["status"] == "accepted"


@pytest.mark.asyncio
async def test_une_demande_deja_traitee_ne_se_retraite_pas(client):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    booking = await _demande(client, ana, luis["user"]["id"])

    await client.post(f"/api/v1/bookings/{booking['id']}/decline", headers=luis["headers"])
    second = await client.post(
        f"/api/v1/bookings/{booking['id']}/accept", headers=luis["headers"]
    )

    assert second.status_code == 409


@pytest.mark.asyncio
async def test_les_deux_parties_peuvent_annuler(client):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    booking = await _demande(client, ana, luis["user"]["id"])

    response = await client.post(
        f"/api/v1/bookings/{booking['id']}/cancel", headers=ana["headers"]
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_un_tiers_ne_touche_pas_a_la_demande(client):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    curieux = await register(client, email="curieux@exemple.com", first_name="Max")
    booking = await _demande(client, ana, luis["user"]["id"])

    response = await client.post(
        f"/api/v1/bookings/{booking['id']}/cancel", headers=curieux["headers"]
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_une_seance_a_venir_ne_se_cloture_pas(client):
    """Clore une séance qui n'a pas eu lieu ouvrirait le droit d'y laisser un avis."""
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    booking = await _demande(client, ana, luis["user"]["id"])
    await client.post(f"/api/v1/bookings/{booking['id']}/accept", headers=luis["headers"])

    response = await client.post(
        f"/api/v1/bookings/{booking['id']}/complete", headers=ana["headers"]
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_un_partenaire_indisponible_ne_se_reserve_pas(client):
    luis = await make_partner(client)
    await client.patch("/api/v1/auth/me", json={"available": False}, headers=luis["headers"])
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"]),
        headers=ana["headers"],
    )

    assert response.status_code == 409
