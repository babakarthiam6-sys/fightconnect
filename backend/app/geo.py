"""Pays et devises.

Deux listes, et une raison de les séparer.

`COUNTRIES` sert au **profil** : n'importe qui, où qu'il soit, doit pouvoir
remplir sa fiche et être trouvé. Chercher un partenaire, discuter et convenir
d'une séance ne dépend d'aucun prestataire de paiement.

Les pays où l'argent peut effectivement circuler ne sont pas listés ici : c'est
Stripe qui les connaît, et sa couverture change. `app.services.payments` les lui
demande à l'exécution plutôt que de recopier une liste qui vieillirait en
silence.
"""

from __future__ import annotations

# ISO 3166-1 alpha-2. Liste figée volontairement : elle ne bouge qu'à la
# naissance ou à la disparition d'un État, et une dépendance de plus pour ça
# coûterait plus qu'elle ne rapporte.
COUNTRIES: frozenset[str] = frozenset(
    """
    AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ
    BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR
    CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
    GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU
    ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ
    LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ
    MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF
    PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI
    SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR
    TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
    """.split()
)

# Devises que l'application propose pour fixer un tarif. ISO 4217, en majuscules.
# Le libellé et le symbole ne sont écrits nulle part : `Intl.NumberFormat` du
# téléphone les connaît déjà, dans la langue de son propriétaire.
CURRENCIES: tuple[str, ...] = (
    "EUR", "USD", "GBP", "CHF", "CAD", "AUD", "NZD", "JPY", "SEK", "NOK", "DKK",
    "PLN", "CZK", "HUF", "RON", "BGN", "SGD", "HKD", "AED", "BRL", "MXN", "MYR",
    "THB", "ZAR", "INR", "MAD", "TND", "XOF", "XAF", "NGN", "KES", "EGP", "TRY",
)

# Devise proposée par défaut selon le pays. Un boxeur à Londres ne devrait pas
# avoir à corriger « EUR » à la main. Les pays absents retombent sur l'euro,
# valeur historique de l'application.
_DEVISE_PAR_PAYS: dict[str, str] = {
    "US": "USD", "GB": "GBP", "CH": "CHF", "CA": "CAD", "AU": "AUD", "NZ": "NZD",
    "JP": "JPY", "SE": "SEK", "NO": "NOK", "DK": "DKK", "PL": "PLN", "CZ": "CZK",
    "HU": "HUF", "RO": "RON", "BG": "BGN", "SG": "SGD", "HK": "HKD", "AE": "AED",
    "BR": "BRL", "MX": "MXN", "MY": "MYR", "TH": "THB", "ZA": "ZAR", "IN": "INR",
    "MA": "MAD", "TN": "TND", "NG": "NGN", "KE": "KES", "EG": "EGP", "TR": "TRY",
    # Zone franc CFA, Ouest puis Centre.
    "SN": "XOF", "CI": "XOF", "ML": "XOF", "BF": "XOF", "BJ": "XOF", "TG": "XOF",
    "NE": "XOF", "GW": "XOF",
    "CM": "XAF", "GA": "XAF", "CG": "XAF", "TD": "XAF", "CF": "XAF", "GQ": "XAF",
}

DEFAULT_CURRENCY = "EUR"


def devise_par_defaut(country: str | None) -> str:
    """Devise proposée à quelqu'un qui vient de déclarer son pays."""
    if not country:
        return DEFAULT_CURRENCY
    return _DEVISE_PAR_PAYS.get(country.upper(), DEFAULT_CURRENCY)


def normalise_pays(value: str | None) -> str | None:
    """Ramène un code pays à sa forme canonique, ou `None` s'il est inconnu."""
    if value is None:
        return None
    code = value.strip().upper()
    return code if code in COUNTRIES else None


# Devises sans subdivision : mille yens valent une dizaine d'euros, mille francs
# CFA moins de deux. Un plafond unique exprimé en unités serait absurde pour les
# unes ou pour les autres.
_SANS_SUBDIVISION = frozenset({"JPY", "KRW", "XOF", "XAF", "XPF", "VND", "CLP", "PYG", "UGX"})

TARIF_MAX_DECIMAL = 1000.0
TARIF_MAX_SANS_SUBDIVISION = 200_000.0


def tarif_max(currency: str | None) -> float:
    """Plafond du tarif au round, dans la devise annoncée.

    Le plafond existe pour arrêter une faute de frappe, pas pour dicter un prix.
    Il doit donc valoir à peu près la même chose partout : mille euros d'un
    côté, deux cent mille yens de l'autre.
    """
    return (
        TARIF_MAX_SANS_SUBDIVISION
        if (currency or "").upper() in _SANS_SUBDIVISION
        else TARIF_MAX_DECIMAL
    )
