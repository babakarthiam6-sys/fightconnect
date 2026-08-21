"""Statistiques de revenus, vues depuis le compte du partenaire."""

from tests.conftest import booking_payload, make_partner, register


async def test_statistiques_vides_pour_un_nouveau_compte(client):
    session = await register(client)

    response = await client.get("/api/v1/revenue/stats", headers=session["headers"])

    assert response.status_code == 200
    assert response.json() == {
        "total_earnings": 0,
        "balance": 0,
        "completed_bookings": 0,
        "total_bookings": 0,
        "average_rating": None,
        "currency": "EUR",
    }


async def test_les_gains_sont_nets_de_commission(client, database):
    luis = await make_partner(client, price_per_round=50)
    ana = await register(client, "ana@exemple.com", "Ana")

    creation = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"], rounds=2),
        headers=ana["headers"],
    )
    booking = creation.json()
    assert booking["total"] == 100

    await client.post(f"/api/v1/bookings/{booking['id']}/accept", headers=luis["headers"])

    # Stripe confirme normalement le paiement via son webhook ; ici on écrit
    # directement l'état qu'il produirait.
    from bson import ObjectId

    await database.bookings.update_one(
        {"_id": ObjectId(booking["id"])}, {"$set": {"paid": True}}
    )

    response = await client.get("/api/v1/revenue/stats", headers=luis["headers"])

    body = response.json()
    assert body["total_earnings"] == booking["payout"]
    assert body["total_earnings"] < booking["total"]
    assert body["total_bookings"] == 1


async def test_une_demande_non_payee_ne_compte_pas_dans_les_gains(client):
    """Une demande acceptée mais impayée n'a rien rapporté."""
    luis = await make_partner(client, price_per_round=50)
    ana = await register(client, "ana@exemple.com", "Ana")

    creation = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"]),
        headers=ana["headers"],
    )
    await client.post(
        f"/api/v1/bookings/{creation.json()['id']}/accept", headers=luis["headers"]
    )

    response = await client.get("/api/v1/revenue/stats", headers=luis["headers"])

    assert response.json()["total_earnings"] == 0
    assert response.json()["total_bookings"] == 1


async def test_statistiques_exigent_une_authentification(client):
    assert (await client.get("/api/v1/revenue/stats")).status_code == 401
