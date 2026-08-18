from tests.conftest import register, sparring_payload


async def test_statistiques_vides_pour_un_nouveau_compte(client):
    session = await register(client)

    response = await client.get("/api/v1/revenue/stats", headers=session["headers"])

    assert response.status_code == 200
    assert response.json() == {
        "total_earnings": 0,
        "balance": 0,
        "completed_sparrings": 0,
        "total_sparrings": 0,
        "average_rating": None,
        "currency": "EUR",
    }


async def test_les_gains_sont_nets_de_commission(client, database):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    creation = await client.post(
        "/api/v1/sparrings",
        json=sparring_payload(price=100),
        headers=organisateur["headers"],
    )
    sparring = creation.json()

    acheteur = await register(client, "acheteur@exemple.com", "Léa")
    users = database.users
    acheteur_doc = await users.find_one({"email": "acheteur@exemple.com"})
    sparrings = database.sparrings
    sparring_doc = await sparrings.find_one({"title": "Sparring boxe technique"})

    await database.payments.insert_one(
        {
            "user_id": acheteur_doc["_id"],
            "sparring_id": sparring_doc["_id"],
            "amount": 100.0,
            "currency": "EUR",
            "status": "succeeded",
        }
    )

    response = await client.get("/api/v1/revenue/stats", headers=organisateur["headers"])

    # 10 % de commission par défaut.
    assert response.json()["total_earnings"] == 90.0
    assert response.json()["total_sparrings"] == 1
    assert sparring["id"] == str(sparring_doc["_id"])
    assert acheteur["user"]["id"] == str(acheteur_doc["_id"])


async def test_statistiques_exigent_une_authentification(client):
    assert (await client.get("/api/v1/revenue/stats")).status_code == 401
