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

# Ce qu'une vidéo de profil montre. Trois natures suffisent : elles répondent à
# la seule question que se pose celui qui regarde — « à quoi ressemble cette
# personne en face de moi ? »
VIDEO_KINDS = ("fight", "sparring", "shadow")

# Une galerie se parcourt d'un coup d'œil. Au-delà, elle devient une archive que
# personne ne déroule, et le profil met plus longtemps à s'afficher.
MAX_VIDEOS = 6

# Une annonce dit ce qu'on cherche : un partenaire d'entraînement, ou un
# adversaire pour un vrai combat (gala, interclub). Les deux se trouvent par
# les mêmes critères, mais ne s'abordent pas de la même façon.
ANNOUNCEMENT_KINDS = ("sparring", "fight")

# Au-delà, une seule personne remplirait la liste à elle seule.
MAX_OPEN_ANNOUNCEMENTS = 5

# Sans date précise, une annonce disparaît d'elle-même au bout d'un mois : une
# recherche vieille de trois mois n'est presque jamais encore d'actualité.
ANNOUNCEMENT_LIFETIME_DAYS = 30

# Ce qu'on peut signaler : une personne (son profil), un message reçu, une
# annonce, ou une réponse reçue à l'une de ses annonces.
REPORT_TARGETS = ("user", "message", "announcement", "announcement_reply")

REPORT_REASONS = ("harassment", "fraud", "inappropriate", "fake_profile", "dangerous", "other")

# Décisions de l'administrateur sur un signalement.
REPORT_ACTIONS = ("dismiss", "remove_content", "suspend")


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
    bio: str | None = Field(default=None, max_length=600)
    style: Style | None = None
    level: Level | None = None
    weight_class: WeightClass | None = None
    height_cm: int | None = Field(default=None, ge=120, le=250)
    fights_count: int | None = Field(default=None, ge=0, le=2000)
    experience_years: int | None = Field(default=None, ge=0, le=80)
    price_per_round: float | None = Field(default=None, ge=0, le=1000)
    available: bool | None = None


class UserOut(UserSummary):
    email: EmailStr
    discharge_accepted: bool
    ratings_count: int = 0
    created_at: str | None = None
    # Un partenaire ne peut encaisser un sparring payant qu'une fois Stripe en
    # mesure de lui verser l'argent.
    payouts_enabled: bool = False
    bio: str | None = None
    style: str | None = None
    level: str | None = None
    weight_class: str | None = None
    height_cm: int | None = None
    fights_count: int = 0
    experience_years: int = 0
    available: bool = False
    currency: str = "EUR"
    videos: list["VideoOut"] = []
    expo_push_token: str | None = None
    # L'écran des signalements n'est montré qu'aux administrateurs. Le serveur
    # vérifie de toute façon à chaque appel : ce drapeau ne fait qu'afficher.
    is_admin: bool = False


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
    videos: list["VideoOut"] = []
    # Vrai si le lecteur a bloqué cette personne : la fiche propose alors de la
    # débloquer plutôt que de lui écrire.
    is_blocked: bool = False


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


class VideoCreate(BaseModel):
    """Ajout d'une vidéo à sa propre galerie.

    Seule l'URL est imposée : la plateforme et la vignette sont déduites du lien
    côté serveur, jamais reçues du client, qui pourrait annoncer n'importe quoi.
    """

    url: str = Field(min_length=8, max_length=500)
    kind: str
    caption: str | None = Field(default=None, max_length=120)


class VideoOut(BaseModel):
    id: str
    url: str
    provider: str
    kind: str
    caption: str | None = None
    thumbnail_url: str | None = None


class VideoList(BaseModel):
    items: list[VideoOut]


class VideoOrder(BaseModel):
    """Nouvel ordre de la galerie : la première vidéo sert de couverture."""

    ids: list[str] = Field(max_length=MAX_VIDEOS)


class AnnouncementCreate(BaseModel):
    """Publication d'une annonce.

    Les champs « combattant » servent au coach qui cherche un adversaire pour
    l'un de ses élèves : l'annonce décrit alors quelqu'un d'autre que son auteur.
    """

    kind: str
    style: str
    city: str = Field(min_length=2, max_length=80)
    level: str | None = None
    weight_class: str | None = None
    scheduled_for: str | None = None
    message: str = Field(min_length=10, max_length=600)
    fighter_name: str | None = Field(default=None, max_length=60)
    fighter_record: str | None = Field(default=None, max_length=40)
    weight_kg: float | None = Field(default=None, ge=40, le=160)
    video_url: str | None = Field(default=None, max_length=500)


class AnnouncementReplyCreate(BaseModel):
    message: str = Field(min_length=2, max_length=300)


class AnnouncementReplyOut(BaseModel):
    id: str
    message: str
    created_at: str | None = None
    author: UserSummary | None = None


class AnnouncementOut(BaseModel):
    id: str
    kind: str
    style: str
    city: str
    level: str | None = None
    weight_class: str | None = None
    scheduled_for: str | None = None
    message: str
    fighter_name: str | None = None
    fighter_record: str | None = None
    weight_kg: float | None = None
    video_url: str | None = None
    video_provider: str | None = None
    status: str = "open"
    created_at: str | None = None
    expires_at: str | None = None
    author: UserSummary | None = None
    replies_count: int = 0
    is_mine: bool = False
    has_replied: bool = False
    # Les réponses ne sont montrées qu'à l'auteur de l'annonce : celui qui
    # répond s'adresse à lui, pas à tous ceux qui passent.
    replies: list[AnnouncementReplyOut] | None = None


class AnnouncementList(BaseModel):
    items: list[AnnouncementOut]
    total: int
    page: int
    limit: int


class BlockCreate(BaseModel):
    user_id: str


class BlockedList(BaseModel):
    items: list[UserSummary]


class ReportCreate(BaseModel):
    """Signalement. `target_id` désigne le message, l'annonce ou la réponse ;
    il est absent quand c'est la personne, son profil, qui est signalée."""

    user_id: str
    target_type: str = "user"
    target_id: str | None = None
    reason: str
    details: str | None = Field(default=None, max_length=500)


class ReportAck(BaseModel):
    id: str
    status: str


class ReportOut(BaseModel):
    id: str
    target_type: str
    target_id: str | None = None
    reason: str
    details: str | None = None
    # Copie du contenu au moment du signalement : il reste lisible même si son
    # auteur l'efface entre-temps.
    excerpt: str | None = None
    status: str
    resolution: str | None = None
    created_at: str | None = None
    reporter: UserSummary | None = None
    reported: UserSummary | None = None
    reported_open_reports: int = 0
    reported_suspended: bool = False


class ReportList(BaseModel):
    items: list[ReportOut]
    total: int


class ReportResolve(BaseModel):
    action: str
