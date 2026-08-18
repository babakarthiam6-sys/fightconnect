"""Schémas d'entrée et de sortie de l'API.

Le contrat est en snake_case : c'est ce que le client mobile attend.
"""

from pydantic import BaseModel, EmailStr, Field

Level = str
Style = str

LEVELS = ("beginner", "intermediate", "advanced", "pro")
STYLES = ("boxing", "muay_thai", "kickboxing", "mma", "bjj", "wrestling", "karate", "judo")


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


class UserOut(UserSummary):
    email: EmailStr
    discharge_accepted: bool
    ratings_count: int = 0
    created_at: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SparringCreate(BaseModel):
    title: str = Field(min_length=5, max_length=80)
    description: str = Field(min_length=20, max_length=1000)
    location: str = Field(min_length=3, max_length=120)
    scheduled_at: str
    duration_minutes: int = Field(ge=15, le=480)
    level: Level
    style: Style
    price: float = Field(ge=0, le=1000)
    max_participants: int = Field(ge=2, le=50)


class SparringOut(BaseModel):
    id: str
    title: str
    description: str
    location: str
    scheduled_at: str
    duration_minutes: int
    level: str
    style: str
    price: float
    currency: str
    max_participants: int
    participants: list[UserSummary]
    creator: UserSummary | None
    status: str
    created_at: str | None = None


class SparringList(BaseModel):
    items: list[SparringOut]
    total: int
    page: int
    limit: int


class PaymentIntentRequest(BaseModel):
    sparring_id: str


class PaymentIntentOut(BaseModel):
    client_secret: str
    payment_intent_id: str
    amount: float
    currency: str
    publishable_key: str | None = None


class PaymentOut(BaseModel):
    id: str
    sparring_id: str | None
    sparring_title: str | None
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
    completed_sparrings: int
    total_sparrings: int
    average_rating: float | None
    currency: str


class ReviewCreate(BaseModel):
    sparring_id: str
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=10, max_length=1000)


class ReviewOut(BaseModel):
    id: str
    sparring_id: str
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
