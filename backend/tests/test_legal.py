"""Pages publiques de confidentialité et de suppression du compte."""

from app.config import get_settings


async def test_la_politique_decrit_les_donnees_collectees(client):
    response = await client.get("/confidentialite")

    assert response.status_code == 200
    for donnee in ("email", "Profil sportif", "Messages", "Stripe"):
        assert donnee in response.text
    assert 'href="/suppression-compte"' in response.text


async def test_la_page_de_suppression_explique_la_marche_a_suivre(client):
    response = await client.get("/suppression-compte")

    assert response.status_code == 200
    assert "Supprimer mon compte" in response.text
    assert "remboursée" in response.text


async def test_l_adresse_de_contact_est_echappee(client, monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("CONTACT_EMAIL", "aide@exemple.com<script>")
    try:
        response = await client.get("/confidentialite")
    finally:
        get_settings.cache_clear()

    assert "mailto:aide@exemple.com&lt;script&gt;" in response.text
    assert "<script>" not in response.text
