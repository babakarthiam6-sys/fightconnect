from tests.conftest import register, sparring_payload

BASE = "/api/v1/sparrings"


async def create_sparring(client, headers, **overrides):
    response = await client.post(BASE, json=sparring_payload(**overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_creation_exige_une_authentification(client):
    response = await client.post(BASE, json=sparring_payload())
    assert response.status_code == 401


async def test_creation_renvoie_le_sparring_complet(client):
    session = await register(client)

    sparring = await create_sparring(client, session["headers"])

    assert sparring["title"] == "Sparring boxe technique"
    assert sparring["creator"]["id"] == session["user"]["id"]
    assert sparring["participants"] == []
    assert sparring["status"] == "open"
    assert sparring["currency"] == "EUR"


async def test_creation_refuse_une_date_passee(client):
    session = await register(client)

    response = await client.post(
        BASE,
        json=sparring_payload(scheduled_at="2020-01-01T10:00:00+00:00"),
        headers=session["headers"],
    )

    assert response.status_code == 422


async def test_creation_refuse_une_discipline_inconnue(client):
    session = await register(client)

    response = await client.post(
        BASE, json=sparring_payload(style="sumo"), headers=session["headers"]
    )

    assert response.status_code == 422


async def test_liste_paginee_et_filtrable(client):
    session = await register(client)
    await create_sparring(client, session["headers"], title="Boxe à Paris", style="boxing")
    await create_sparring(
        client, session["headers"], title="MMA à Lyon", location="Lyon", style="mma", price=50
    )

    tout = await client.get(BASE)
    assert tout.json()["total"] == 2

    par_style = await client.get(BASE, params={"style": "mma"})
    assert [item["title"] for item in par_style.json()["items"]] == ["MMA à Lyon"]

    par_recherche = await client.get(BASE, params={"search": "lyon"})
    assert par_recherche.json()["total"] == 1

    par_prix = await client.get(BASE, params={"max_price": 30})
    assert [item["title"] for item in par_prix.json()["items"]] == ["Boxe à Paris"]

    page_2 = await client.get(BASE, params={"page": 2, "limit": 1})
    assert len(page_2.json()["items"]) == 1
    assert page_2.json()["total"] == 2


async def test_detail_inconnu_renvoie_404(client):
    assert (await client.get(f"{BASE}/000000000000000000000000")).status_code == 404
    # Un identifiant malformé ne doit pas produire une 500.
    assert (await client.get(f"{BASE}/pas-un-id")).status_code == 404


async def test_rejoindre_un_sparring_gratuit(client):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_sparring(client, organisateur["headers"], price=0)

    partenaire = await register(client, "partenaire@exemple.com", "Léa")
    response = await client.post(f"{BASE}/{sparring['id']}/join", headers=partenaire["headers"])

    assert response.status_code == 200
    assert [person["id"] for person in response.json()["participants"]] == [
        partenaire["user"]["id"]
    ]


async def test_rejoindre_deux_fois_est_refuse(client):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_sparring(client, organisateur["headers"], price=0)
    partenaire = await register(client, "partenaire@exemple.com", "Léa")

    await client.post(f"{BASE}/{sparring['id']}/join", headers=partenaire["headers"])
    seconde = await client.post(f"{BASE}/{sparring['id']}/join", headers=partenaire["headers"])

    assert seconde.status_code == 409


async def test_organisateur_ne_rejoint_pas_sa_propre_seance(client):
    organisateur = await register(client)
    sparring = await create_sparring(client, organisateur["headers"], price=0)

    response = await client.post(f"{BASE}/{sparring['id']}/join", headers=organisateur["headers"])

    assert response.status_code == 409


async def test_sparring_payant_exige_un_paiement_abouti(client):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_sparring(client, organisateur["headers"], price=25)
    partenaire = await register(client, "partenaire@exemple.com", "Léa")

    response = await client.post(f"{BASE}/{sparring['id']}/join", headers=partenaire["headers"])

    assert response.status_code == 402


async def test_sparring_complet_refuse_les_nouveaux(client):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_sparring(client, organisateur["headers"], price=0, max_participants=2)

    for index in range(2):
        partenaire = await register(client, f"p{index}@exemple.com", f"P{index}")
        assert (
            await client.post(f"{BASE}/{sparring['id']}/join", headers=partenaire["headers"])
        ).status_code == 200

    tardif = await register(client, "tardif@exemple.com", "Tardif")
    response = await client.post(f"{BASE}/{sparring['id']}/join", headers=tardif["headers"])

    assert response.status_code == 409
    detail = await client.get(f"{BASE}/{sparring['id']}")
    assert detail.json()["status"] == "full"


async def test_annulation_libere_la_place(client):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_sparring(client, organisateur["headers"], price=0, max_participants=2)
    partenaire = await register(client, "partenaire@exemple.com", "Léa")

    await client.post(f"{BASE}/{sparring['id']}/join", headers=partenaire["headers"])
    annulation = await client.post(f"{BASE}/{sparring['id']}/cancel", headers=partenaire["headers"])

    assert annulation.status_code == 200
    assert annulation.json()["participants"] == []
    assert annulation.json()["status"] == "open"


async def test_annuler_sans_participer_est_refuse(client):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_sparring(client, organisateur["headers"], price=0)
    autre = await register(client, "autre@exemple.com", "Autre")

    response = await client.post(f"{BASE}/{sparring['id']}/cancel", headers=autre["headers"])

    assert response.status_code == 409
