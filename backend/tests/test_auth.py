from tests.conftest import register


async def test_signup_cree_un_compte_et_renvoie_un_jeton(client):
    session = await register(client)

    assert session["token"]
    assert session["user"]["email"] == "jean@exemple.com"
    assert session["user"]["discharge_accepted"] is True
    # Le hachage ne doit jamais sortir de la base.
    assert "password" not in session["user"]
    assert "password_hash" not in session["user"]


async def test_signup_refuse_un_email_deja_pris(client):
    await register(client)

    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": "jean@exemple.com",
            "password": "Sparring1",
            "first_name": "Jean",
            "last_name": "Dupont",
            "discharge_accepted": True,
        },
    )

    assert response.status_code == 409


async def test_signup_refuse_sans_decharge(client):
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": "sans@decharge.com",
            "password": "Sparring1",
            "first_name": "Jean",
            "last_name": "Dupont",
            "discharge_accepted": False,
        },
    )

    assert response.status_code == 422


async def test_signup_refuse_un_mot_de_passe_trop_court(client):
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": "court@exemple.com",
            "password": "court",
            "first_name": "Jean",
            "last_name": "Dupont",
            "discharge_accepted": True,
        },
    )

    assert response.status_code == 422


async def test_login_reussit_avec_les_bons_identifiants(client):
    await register(client)

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "jean@exemple.com", "password": "Sparring1"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


async def test_login_ne_distingue_pas_email_inconnu_et_mot_de_passe_faux(client):
    await register(client)

    inconnu = await client.post(
        "/api/v1/auth/login",
        json={"email": "personne@exemple.com", "password": "Sparring1"},
    )
    mauvais = await client.post(
        "/api/v1/auth/login",
        json={"email": "jean@exemple.com", "password": "Mauvais123"},
    )

    assert inconnu.status_code == mauvais.status_code == 401
    assert inconnu.json()["detail"] == mauvais.json()["detail"]


async def test_me_renvoie_le_profil_du_porteur(client):
    session = await register(client)

    response = await client.get("/api/v1/auth/me", headers=session["headers"])

    assert response.status_code == 200
    assert response.json()["first_name"] == "Jean"


async def test_me_refuse_sans_jeton(client):
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_me_refuse_un_jeton_invalide(client):
    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer pas-un-vrai-jeton"}
    )

    assert response.status_code == 401
