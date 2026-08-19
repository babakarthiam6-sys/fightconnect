from datetime import datetime, timedelta, timezone

from app.services import throttle
from tests.conftest import register

LOGIN = "/api/v1/auth/login"


async def echec_de_connexion(client, email: str = "jean@exemple.com"):
    return await client.post(LOGIN, json={"email": email, "password": "MauvaisMdp1"})


async def test_les_echecs_repetes_finissent_par_bloquer(client):
    await register(client)

    for _ in range(throttle.MAX_FAILURES):
        assert (await echec_de_connexion(client)).status_code == 401

    bloque = await echec_de_connexion(client)
    assert bloque.status_code == 429
    assert int(bloque.headers["Retry-After"]) > 0


async def test_le_blocage_vaut_aussi_pour_le_bon_mot_de_passe(client):
    """Sinon le blocage ne servirait à rien : il suffirait de tomber juste."""
    await register(client)
    for _ in range(throttle.MAX_FAILURES):
        await echec_de_connexion(client)

    response = await client.post(
        LOGIN, json={"email": "jean@exemple.com", "password": "Sparring1"}
    )

    assert response.status_code == 429


async def test_une_connexion_reussie_remet_le_compteur_a_zero(client, database):
    await register(client)
    for _ in range(throttle.MAX_FAILURES - 1):
        await echec_de_connexion(client)

    reussite = await client.post(
        LOGIN, json={"email": "jean@exemple.com", "password": "Sparring1"}
    )

    assert reussite.status_code == 200
    assert await database.login_attempts.find_one({"email": "jean@exemple.com"}) is None


async def test_le_blocage_ne_touche_pas_les_autres_comptes(client):
    await register(client, "jean@exemple.com", "Jean")
    await register(client, "lea@exemple.com", "Léa")

    for _ in range(throttle.MAX_FAILURES):
        await echec_de_connexion(client, "jean@exemple.com")

    autre = await client.post(LOGIN, json={"email": "lea@exemple.com", "password": "Sparring1"})
    assert autre.status_code == 200


async def test_un_email_inconnu_est_freine_aussi(client):
    """Sans cela, l'énumération de comptes redeviendrait possible par le timing."""
    for _ in range(throttle.MAX_FAILURES):
        assert (await echec_de_connexion(client, "fantome@exemple.com")).status_code == 401

    assert (await echec_de_connexion(client, "fantome@exemple.com")).status_code == 429


async def test_les_echecs_anciens_ne_comptent_plus(client, database):
    await register(client)
    for _ in range(throttle.MAX_FAILURES - 1):
        await echec_de_connexion(client)

    # On recule le dernier échec au-delà de la fenêtre d'observation.
    ancien = datetime.now(timezone.utc) - throttle.FAILURE_WINDOW - timedelta(minutes=1)
    await database.login_attempts.update_one(
        {"email": "jean@exemple.com"}, {"$set": {"last_failure_at": ancien}}
    )

    # Le compteur repart de zéro : cet échec ne doit pas déclencher le blocage.
    assert (await echec_de_connexion(client)).status_code == 401
    assert (await echec_de_connexion(client)).status_code == 401


async def test_le_blocage_expire(client, database):
    await register(client)
    for _ in range(throttle.MAX_FAILURES):
        await echec_de_connexion(client)
    assert (await echec_de_connexion(client)).status_code == 429

    await database.login_attempts.update_one(
        {"email": "jean@exemple.com"},
        {"$set": {"locked_until": datetime.now(timezone.utc) - timedelta(seconds=1)}},
    )

    response = await client.post(
        LOGIN, json={"email": "jean@exemple.com", "password": "Sparring1"}
    )
    assert response.status_code == 200
