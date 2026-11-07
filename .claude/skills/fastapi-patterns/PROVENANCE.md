# Provenance

Copie de `skills/fastapi-patterns` du dépôt amont ECC (ex-everything-claude-code).

- Source : https://github.com/affaan-m/ECC
- Auteur : Affaan Mustafa
- Licence : MIT (voir `LICENSE`)
- Commit repris : `d2ef2680594f9a17526a6e1a2e18b3d242c5d17b`

Les exemples du skill supposent SQLAlchemy ; FightConnect utilise MongoDB
(motor). Seuls les principes valent ici : schémas Pydantic v2, dépendances,
couche service, tests httpx. Les invariants de `CLAUDE.md` priment toujours
(index unique partiel, base reçue par la dépendance, etc.).
