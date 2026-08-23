"""Modération des avis et des messages.

Utilise l'API de modération OpenAI quand une clé est configurée, et retombe
sinon sur une heuristique locale. La modération ne doit jamais empêcher la
publication d'un avis : en cas de panne du fournisseur, l'avis passe et n'est
pas signalé — un faux négatif est préférable à une perte de contenu.
"""

import re
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


# Tentatives de sortir la transaction de la plateforme. Détectées par motif et
# non par mot isolé : « 06 12 34 56 78 » dans « je t'appelle en arrivant » est
# légitime, la même suite dans « paie-moi en liquide » ne l'est pas.
_ESQUIVE_MOTIFS = (
    # Argent liquide, en français puis en anglais. « cash » couvrait déjà les
    # deux ; le reste ne couvrait que le français, et un message anglais
    # proposant de payer de la main à la main passait sans être vu.
    re.compile(
        r"\b(esp[èe]ces?|liquide|cash|de\s*la\s*main\s*[àa]\s*la\s*main"
        r"|in\s*hand|hand\s*to\s*hand|under\s*the\s*table)\b",
        re.I,
    ),
    # « sans / hors / éviter » suivi, à quelques mots près, de ce qu'on esquive.
    # L'écart tolère « sans passer par l'appli » comme « sans l'appli ».
    re.compile(
        r"\b(sans|hors|[ée]viter)\b[^.!?]{0,30}?\b(appli|application|plateforme|frais|commission)",
        re.I,
    ),
    # Le même mouvement en anglais : « outside the app », « skip the fee »,
    # « without the platform », « off the app ».
    re.compile(
        r"\b(outside|without|off|skip|avoid|bypass)\b[^.!?]{0,30}?"
        r"\b(app|application|platform|fee|fees|commission|site)\b",
        re.I,
    ),
    # Pas de frontière finale : « PayPal, » ou « paypal:» restent des paiements
    # hors plateforme. Les services listés couvrent l'Europe, l'Amérique du Nord
    # et l'Afrique de l'Ouest — là où l'application peut raisonnablement aller.
    re.compile(
        r"\b(paypal|lydia|revolut|virement|paylib|wise|venmo|zelle|cashapp|cash\s*app"
        r"|bank\s*transfer|wire\s*transfer|e[- ]?transfer|orange\s*money|wave|mtn\s*momo)",
        re.I,
    ),
    re.compile(
        r"\b(whatsapp|instagram|insta|telegram|snapchat|snap|signal|messenger|wechat|viber)\b",
        re.I,
    ),
)

# Un contact seul n'est pas suspect ; couplé à un motif d'esquive, il l'est.
_CONTACT = re.compile(r"(\+?\d[\d .-]{7,}\d)|(\b\w+@\w+\.\w{2,}\b)")


def detect_payment_bypass(message: str) -> ModerationResult:
    """Repère une tentative de payer en dehors de la plateforme.

    C'est la fraude propre à un marché de services : les deux parties se
    trouvent grâce à l'application, puis s'arrangent ailleurs. La détection reste
    volontairement prudente — signaler à tort un message anodin ferait plus de
    dégâts qu'en laisser passer un.
    """
    motifs = sum(1 for motif in _ESQUIVE_MOTIFS if motif.search(message))
    if motifs == 0:
        return ModerationResult(flagged=False)

    # Un seul motif isolé peut être une phrase ordinaire (« j'ai pas de liquide
    # sur moi »). Deux motifs, ou un motif accompagné d'un contact, ne le sont
    # plus guère.
    if motifs >= 2 or _CONTACT.search(message):
        return ModerationResult(flagged=True, reason="payment_bypass", score=0.9)
    return ModerationResult(flagged=True, reason="payment_bypass", score=0.5)


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


async def moderate_message(message: str) -> ModerationResult:
    """Modération d'un message de discussion.

    Deux passes : la fraude au paiement, propre à un marché de services, puis la
    toxicité, que l'API d'OpenAI traite mieux qu'une liste de mots.
    """
    esquive = detect_payment_bypass(message)
    if esquive.flagged:
        return esquive
    return await moderate_comment(message)
