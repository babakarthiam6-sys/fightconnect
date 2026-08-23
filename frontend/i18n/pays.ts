/**
 * Noms de pays et de devises, dans la langue de l'utilisateur.
 *
 * Rien n'est traduit à la main ici. `Intl.DisplayNames` connaît déjà les deux
 * cent quarante-neuf pays dans toutes les langues du système : recopier cette
 * table dans le catalogue reviendrait à en maintenir une version qui vieillit,
 * pour un résultat moins bon. Le code brut sert de repli là où `Intl` est
 * absent — visible, donc corrigeable.
 */

/** Pays acceptés au profil, en miroir de `backend/app/geo.py`. */
export const CODES_PAYS: readonly string[] =
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ
   BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR
   CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
   GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU
   ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ
   LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ
   MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF
   PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI
   SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR
   TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`
    .trim()
    .split(/\s+/);

/** Devises proposées, en miroir de `backend/app/geo.py`. */
export const CODES_DEVISE: readonly string[] = [
  'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD', 'JPY', 'SEK', 'NOK', 'DKK',
  'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'SGD', 'HKD', 'AED', 'BRL', 'MXN', 'MYR',
  'THB', 'ZAR', 'INR', 'MAD', 'TND', 'XOF', 'XAF', 'NGN', 'KES', 'EGP', 'TRY',
];

function nommeur(locale: string, type: 'region' | 'currency'): ((code: string) => string) | null {
  try {
    const noms = new Intl.DisplayNames([locale], { type });
    return (code) => noms.of(code) ?? code;
  } catch {
    return null;
  }
}

/** Pays triés par nom traduit — l'ordre alphabétique change avec la langue. */
export function optionsPays(locale: string): Record<string, string> {
  const nomme = nommeur(locale, 'region');
  const paires = CODES_PAYS.map((code) => [code, nomme ? nomme(code) : code] as const);
  paires.sort((a, b) => a[1].localeCompare(b[1], locale));
  return Object.fromEntries(paires);
}

export function optionsDevise(locale: string): Record<string, string> {
  const nomme = nommeur(locale, 'currency');
  return Object.fromEntries(
    CODES_DEVISE.map((code) => [code, nomme ? `${code} — ${nomme(code)}` : code]),
  );
}

export function nomDuPays(code: string | null | undefined, locale: string): string | null {
  if (!code) return null;
  const nomme = nommeur(locale, 'region');
  return nomme ? nomme(code) : code;
}
