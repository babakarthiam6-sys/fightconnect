"""Schémas d'entrée et de sortie de l'API.

Le contrat est en snake_case : c'est ce que le client mobile attend.
"""

from pydantic import BaseModel, EmailStr, Field

Level = str
Style = str
WeightClass = str

LEVELS = ("beginner", "amateur", "pro")

STYLES = ("boxing", "muay_thai", "kickboxing", "mma", "bjj", "wrestling", "karate", "judo")

# Catégories de poids de la boxe amateur, bornes en kilogrammes. Le libellé
# affiché vit côté mobile : le serveur ne connaît que l'identifiant.
WEIGHT_CLASSES = (
    "flyweight",
    "bantamweight",
    "featherweight",
    "lightweight",
    "welterweight",
    "middleweight",
    "light_heavyweight",
    "heavyweight",
)

BOOKING_STATUSES = ("pending", "accepted", "declined", "cancelled", "completed")


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=2, max_length=50)
    last_name: str = Field(min_length=2, max_length=50)
    discharge_accepted: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserSummary(BaseModel):
    id: str
    first_name: str
    last_name: str
    avatar_url: str | None = None
    average_rating: float | None = None
    city: str | None = None
    price_per_round: float | None = None


class ProfileUpdate(BaseModel):
    """Modification du profil sportif.

    Tous les champs sont facultatifs : l'écran de profil enregistre un champ à la
    fois, et un compte tout juste créé n'en a encore aucun.
    """

    first_name: str | None = Field(default=None, min_length=2, max_length=50)
    last_name: str | None = Field(default=None, min_length=2, max_length=50)
    city: str | None = Field(default=None, max_length=80)
    # ISO 3166-1 alpha-2. Sans lui, « Paris » ramène la France et le Texas dans
    # la même liste.
    country: str | None = Field(default=None, min_length=2, max_length=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    bio: str | None = Field(default=None, max_length=600)
    style: Style | None = None
    level: Level | None = None
    weight_class: WeightClass | None = None
    height_cm: int | None = Field(default=None, ge=120, le=250)
    fights_count: int | None = Field(default=None, ge=0, le=2000)
    experience_years: int | None = Field(default=None, ge=0, le=80)
    # Le plafond réel dépend de la devise et se vérifie dans le routeur : mille
    # francs CFA valent moins de deux euros, la même borne pour tous n'a pas de
    # sens. Celle-ci n'arrête qu'une saisie manifestement folle.
    price_per_round: float | None = Field(default=None, ge=0, le=1_000_000)
    available: bool | None = None


class UserOut(UserSummary):
    email: EmailStr
    discharge_accepted: bool
    ratings_count: int = 0
    created_at: str | None = None
    # Un partenaire ne peut encaisser un sparring payant qu'une fois Stripe en
    # mesure de lui verser l'argent.
    payouts_enabled: bool = False
    country: str | None = None
    bio: str | None = None
    style: str | None = None
    level: str | None = None
    weight_class: str | None = None
    height_cm: int | None = None
    fights_count: int = 0
    experience_years: int = 0
    available: bool = False
    currency: str = "EUR"
    expo_push_token: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PartnerOut(BaseModel):
    """Fiche publique d'un partenaire : jamais d'email ni de données de compte."""

    id: str
    first_name: str
    last_name: str
    avatar_url: str | None = None
    average_rating: float | None = None
    ratings_count: int = 0
    city: str | None = None
    country: str | None = None
    bio: str | None = None
    style: str | None = None
    level: str | None = None
    weight_class: str | None = None
    height_cm: int | None = None
    fights_count: int = 0
    experience_years: int = 0
    price_per_round: float | None = None
    currency: str = "EUR"
    available: bool = False
    # Stripe accepte de verser l'argent à cette personne. Exposé sur la fiche
    # publique pour que l'écran de réservation prévienne avant la demande, et
    # non au moment de payer — le pire moment pour l'apprendre.
    payouts_enabled: bool = False


class PartnerList(BaseModel):
    items: list[PartnerOut]
    total: int
    page: int
    limit: int


class BookingCreate(BaseModel):
    partner_id: str
    scheduled_at: str
    rounds: int = Field(ge=1, le=20)


class BookingOut(BaseModel):
    id: str
    requester: UserSummary | None
    partner: UserSummary | None
    scheduled_at: str
    rounds: int
    price_per_round: float
    total: float
    commission: float
    payout: float
    currency: str
    status: str
    paid: bool = False
    reviewed: bool = False
    created_at: str | None = None


class BookingList(BaseModel):
    items: list[BookingOut]
    total: int


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    recipient_id: str
    author: UserSummary | None
    content: str
    read: bool
    created_at: str | None = None


class MessageList(BaseModel):
    items: list[MessageOut]
    total: int


class ConversationOut(BaseModel):
    id: str
    other: UserSummary | None
    last_message: str
    last_message_at: str | None
    unread: int


class ConversationList(BaseModel):
    items: list[ConversationOut]
    total: int


class PushTokenRequest(BaseModel):
    """Jeton d'appareil pour les notifications. `null` le détache."""

    expo_push_token: str | None = Field(default=None, max_length=200)


class PaymentIntentRequest(BaseModel):
    booking_id: str


class PaymentIntentOut(BaseModel):
    client_secret: str
    payment_intent_id: str
    amount: float
    currency: str
    publishable_key: str | None = None


class PaymentOut(BaseModel):
    id: str
    booking_id: str | None
    partner_name: str | None
    amount: float
    currency: str
    status: str
    created_at: str | None
    receipt_url: str | None = None


class PaymentList(BaseModel):
    items: list[PaymentOut]
    total: int


class RevenueStatsOut(BaseModel):
    total_earnings: float
    balance: float
    completed_bookings: int
    total_bookings: int
    average_rating: float | None
    currency: str


class ReviewCreate(BaseModel):
    booking_id: str
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=10, max_length=1000)


class ReviewOut(BaseModel):
    id: str
    booking_id: str
    author: UserSummary | None
    rating: int
    comment: str
    created_at: str | None
    flagged: bool
    flag_reason: str | None = None
    moderation_score: float | None = None


class ReviewList(BaseModel):
    items: list[ReviewOut]
    total: int


class UserRiskOut(BaseModel):
    user_id: str
    risk_level: str
    score: float
    reasons: list[str]


class PayoutStatusOut(BaseModel):
    """État du compte de versement d'un partenaire."""

    connected: bool
    details_submitted: bool
    payouts_enabled: bool
    stripe_configured: bool


class OnboardingLinkOut(BaseModel):
    url: str
