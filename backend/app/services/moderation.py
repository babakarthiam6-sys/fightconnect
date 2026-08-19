"""Modération des avis.

Utilise l'API de modération OpenAI quand une clé est configurée, et retombe
sinon sur une heuristique locale. La modération ne doit jamais empêcher la
publication d'un avis : en cas de panne du fournisseur, l'avis passe et n'est
pas signalé — un faux négatif est préférable à une perte de contenu.
"""

from dataclasses import dataclass

from app.config import get_settings

# Termes manifestement abusifs, utilisés seulement quand OpenAI n'est pas joignable.
_FALLBACK_TERMS = (
    "connard",
    "enculé",
    "salope",
    "ta gueule",
    "fdp",
    "nique ta",
    "sale race",
    "asshole",
    "fuck you",
    "kill yourself",
)


@dataclass(frozen=True)
class ModerationResult:
    flagged: bool
    reason: str | None = None
    score: float | None = None


def _fallback(comment: str) -> ModerationResult:
    lowered = comment.lower()
    for term in _FALLBACK_TERMS:
        if term in lowered:
            return ModerationResult(flagged=True, reason="harassment", score=1.0)
    return ModerationResult(flagged=False)


async def moderate_comment(comment: str) -> ModerationResult:
    settings = get_settings()

    if not settings.is_openai_configured:
        return _fallback(comment)

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.moderations.create(
            model=settings.openai_moderation_model,
            input=comment,
        )
        result = response.results[0]

        if not result.flagged:
            return ModerationResult(flagged=False)

        # On retient la catégorie au score le plus élevé : c'est le motif le plus
        # parlant à afficher dans l'application.
        scores = {
            category: value
            for category, value in result.category_scores.model_dump().items()
            if isinstance(value, (int, float))
        }
        reason, score = max(scores.items(), key=lambda item: item[1], default=("other", 0.0))
        return ModerationResult(flagged=True, reason=reason, score=round(float(score), 4))
    except Exception:
        return _fallback(comment)


def risk_level_from(flagged_count: int, total_count: int) -> tuple[str, float, list[str]]:
    """Profil de risque d'un utilisateur, dérivé de ses avis signalés."""
    if total_count == 0:
        return "low", 0.0, ["Aucun avis publié pour le moment."]

    ratio = flagged_count / total_count
    reasons: list[str] = [f"{flagged_count} avis signalé(s) sur {total_count}."]

    if ratio >= 0.5 or flagged_count >= 5:
        return "high", round(ratio, 2), reasons + ["Signalements récurrents."]
    if ratio > 0:
        return "medium", round(ratio, 2), reasons
    return "low", 0.0, ["Aucun avis signalé."]
