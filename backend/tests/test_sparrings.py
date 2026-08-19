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


async def test_filtre_par_organisateur(client):
    ada = await register(client, "ada@exemple.com", "Ada")
    lea = await register(client, "lea@exemple.com", "Léa")
    await create_sparring(client, ada["headers"], title="Séance d’Ada")
    await create_sparring(client, lea["headers"], title="Séance de Léa")

    response = await client.get(BASE, params={"creator_id": ada["user"]["id"]})

    assert response.json()["total"] == 1
    assert response.json()["items"][0]["title"] == "Séance d’Ada"


async def test_filtre_par_organisateur_illisible_renvoie_une_liste_vide(client):
    session = await register(client)
    await create_sparring(client, session["headers"])

    response = await client.get(BASE, params={"creator_id": "pas-un-id"})

    # Une liste filtrée sur un identifiant absurde est vide, elle n'est pas en erreur.
    assert response.status_code == 200
    assert response.json()["total"] == 0


async def test_la_garde_atomique_refuse_une_place_quand_le_quota_est_atteint(client, database):
    """Vérifie la condition Mongo sur laquelle repose l'inscription.

    L'inscription ne s'appuie pas sur le `len()` lu en amont — deux requêtes
    simultanées le liraient toutes les deux avant que l'une écrive — mais sur une
    condition évaluée au moment de l'écriture. C'est cette condition qui est
    testée ici, directement au niveau de la base : le simulateur utilisé par les
    tests n'entrelace pas les coroutines et ne peut donc pas reproduire la course.
    """
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_sparring(
        client, organisateur["headers"], price=0, max_participants=2
    )
    document = await database.sparrings.find_one({"title": "Sparring boxe technique"})
    garde = {"participant_ids.1": {"$exists": False}}

    libre = await database.sparrings.update_one(
        {"_id": document["_id"], **garde}, {"$addToSet": {"participant_ids": "premier"}}
    )
    assert libre.modified_count == 1

    seconde = await database.sparrings.update_one(
        {"_id": document["_id"], **garde}, {"$addToSet": {"participant_ids": "second"}}
    )
    assert seconde.modified_count == 1

    # Le quota est atteint : toute écriture supplémentaire est rejetée par la base.
    troisieme = await database.sparrings.update_one(
        {"_id": document["_id"], **garde}, {"$addToSet": {"participant_ids": "troisieme"}}
    )
    assert troisieme.modified_count == 0

    final = await database.sparrings.find_one({"_id": document["_id"]})
    assert len(final["participant_ids"]) == 2
    assert sparring["id"] == str(document["_id"])
