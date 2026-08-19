from tests.conftest import register, sparring_payload

BASE = "/api/v1/moderation"


async def setup_participation(client, price: float = 0):
    """Un organisateur, une séance et un partenaire déjà inscrit."""
    organisateur = await register(client, "orga@exemple.com", "Ada")
    response = await client.post(
        "/api/v1/sparrings", json=sparring_payload(price=price), headers=organisateur["headers"]
    )
    sparring = response.json()

    partenaire = await register(client, "partenaire@exemple.com", "Léa")
    await client.post(
        f"/api/v1/sparrings/{sparring['id']}/join", headers=partenaire["headers"]
    )
    return organisateur, sparring, partenaire


async def test_avis_refuse_aux_non_participants(client):
    _, sparring, _ = await setup_participation(client)
    intrus = await register(client, "intrus@exemple.com", "Intrus")

    response = await client.post(
        f"{BASE}/reviews",
        json={"sparring_id": sparring["id"], "rating": 5, "comment": "Super séance de boxe."},
        headers=intrus["headers"],
    )

    assert response.status_code == 403


async def test_avis_publie_par_un_participant(client):
    _, sparring, partenaire = await setup_participation(client)

    response = await client.post(
        f"{BASE}/reviews",
        json={"sparring_id": sparring["id"], "rating": 5, "comment": "Très bonne séance, merci."},
        headers=partenaire["headers"],
    )

    assert response.status_code == 201
    body = response.json()
    assert body["flagged"] is False
    assert body["author"]["id"] == partenaire["user"]["id"]


async def test_avis_abusif_est_signale(client):
    _, sparring, partenaire = await setup_participation(client)

    response = await client.post(
        f"{BASE}/reviews",
        json={
            "sparring_id": sparring["id"],
            "rating": 1,
            "comment": "Quel connard, séance nulle et dangereuse.",
        },
        headers=partenaire["headers"],
    )

    assert response.status_code == 201
    assert response.json()["flagged"] is True
    assert response.json()["flag_reason"] == "harassment"


async def test_un_seul_avis_par_personne_et_par_sparring(client):
    _, sparring, partenaire = await setup_participation(client)
    avis = {"sparring_id": sparring["id"], "rating": 4, "comment": "Bonne séance technique."}

    await client.post(f"{BASE}/reviews", json=avis, headers=partenaire["headers"])
    doublon = await client.post(f"{BASE}/reviews", json=avis, headers=partenaire["headers"])

    assert doublon.status_code == 409


async def test_avis_met_a_jour_la_note_de_l_organisateur(client):
    organisateur, sparring, partenaire = await setup_participation(client)

    await client.post(
        f"{BASE}/reviews",
        json={"sparring_id": sparring["id"], "rating": 4, "comment": "Bonne séance technique."},
        headers=partenaire["headers"],
    )

    profil = await client.get("/api/v1/auth/me", headers=organisateur["headers"])
    assert profil.json()["average_rating"] == 4
    assert profil.json()["ratings_count"] == 1


async def test_un_avis_signale_ne_compte_pas_dans_la_note(client):
    organisateur, sparring, partenaire = await setup_participation(client)

    await client.post(
        f"{BASE}/reviews",
        json={"sparring_id": sparring["id"], "rating": 1, "comment": "Sale race, à éviter."},
        headers=partenaire["headers"],
    )

    profil = await client.get("/api/v1/auth/me", headers=organisateur["headers"])
    assert profil.json()["average_rating"] is None


async def test_profil_de_risque(client):
    _, sparring, partenaire = await setup_participation(client)
    lecteur = await register(client, "lecteur@exemple.com", "Lecteur")

    vierge = await client.get(
        f"{BASE}/user-risk/{partenaire['user']['id']}", headers=lecteur["headers"]
    )
    assert vierge.json()["risk_level"] == "low"

    await client.post(
        f"{BASE}/reviews",
        json={"sparring_id": sparring["id"], "rating": 1, "comment": "Ta gueule, séance nulle."},
        headers=partenaire["headers"],
    )

    apres = await client.get(
        f"{BASE}/user-risk/{partenaire['user']['id']}", headers=lecteur["headers"]
    )
    assert apres.json()["risk_level"] == "high"
    assert apres.json()["reasons"]


async def test_profil_de_risque_utilisateur_inconnu(client):
    lecteur = await register(client)
    response = await client.get(
        f"{BASE}/user-risk/000000000000000000000000", headers=lecteur["headers"]
    )
    assert response.status_code == 404


async def test_recommandations_excluent_mes_seances_et_celles_deja_rejointes(client):
    organisateur, sparring, partenaire = await setup_participation(client)

    # Une autre séance, dans la discipline déjà pratiquée par le partenaire.
    await client.post(
        "/api/v1/sparrings",
        json=sparring_payload(title="Autre séance de boxe", price=0),
        headers=organisateur["headers"],
    )

    pour_partenaire = await client.get(f"{BASE}/recommendations", headers=partenaire["headers"])
    titres = [item["title"] for item in pour_partenaire.json()["items"]]
    assert titres == ["Autre séance de boxe"]

    pour_organisateur = await client.get(f"{BASE}/recommendations", headers=organisateur["headers"])
    assert pour_organisateur.json()["items"] == []
