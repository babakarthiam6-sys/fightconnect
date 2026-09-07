#!/usr/bin/env bash
#
# Installe en une fois l'outillage Claude Code (voir le README de chaque projet amont).
#
#   ./scripts/install-claude-tools.sh              # interactif, demande pour chaque outil
#   ./scripts/install-claude-tools.sh --all        # tout sans poser de question (sauf OmniRoute)
#   ./scripts/install-claude-tools.sh --with-omniroute
#   ./scripts/install-claude-tools.sh --help
#
# Volontairement PAS en `set -e` : un outil qui échoue ne doit pas empêcher les
# autres de s'installer. Chaque étape rapporte son propre résultat, et le
# récapitulatif final dit ce qui est passé et ce qui ne l'est pas.

set -uo pipefail

ASSUME_YES=0
WITH_OMNIROUTE=0
RESULTS=()

c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_dim=$'\033[2m'; c_b=$'\033[1m'; c_off=$'\033[0m'
if [ ! -t 1 ]; then c_ok=; c_warn=; c_err=; c_dim=; c_b=; c_off=; fi

say()  { printf '%s\n' "$*"; }
head2(){ printf '\n%s==> %s%s\n' "$c_b" "$*" "$c_off"; }
ok()   { printf '  %s✓%s %s\n' "$c_ok"   "$c_off" "$*"; RESULTS+=("ok|$*"); }
skip() { printf '  %s–%s %s\n' "$c_dim"  "$c_off" "$*"; RESULTS+=("skip|$*"); }
warn() { printf '  %s!%s %s\n' "$c_warn" "$c_off" "$*"; RESULTS+=("warn|$*"); }
fail() { printf '  %s✗%s %s\n' "$c_err"  "$c_off" "$*"; RESULTS+=("fail|$*"); }

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --all|--yes|-y)     ASSUME_YES=1 ;;
    --with-omniroute)   WITH_OMNIROUTE=1 ;;
    --help|-h)          usage ;;
    *) say "Option inconnue : $arg (essaie --help)"; exit 2 ;;
  esac
done

ask() {
  # ask "Question ?" -> 0 si oui
  [ "$ASSUME_YES" = 1 ] && return 0
  [ -t 0 ] || return 1          # pas de terminal : on ne bloque pas, on saute
  local r
  printf '  %s [o/N] ' "$1"; read -r r
  case "$r" in [oOyY]*) return 0 ;; *) return 1 ;; esac
}

have() { command -v "$1" >/dev/null 2>&1; }

backup_claude_settings() {
  local f="$HOME/.claude/settings.json"
  [ -f "$f" ] || return 0
  local b="$f.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$f" "$b" && say "  ${c_dim}sauvegarde : $b${c_off}"
}

# ---------------------------------------------------------------- 0. prérequis
head2 "Prérequis"

if have node && have npm; then
  ok "node $(node --version) / npm $(npm --version)"
else
  fail "node + npm requis — installe Node.js 18+ puis relance (https://nodejs.org)"
  say ""
  say "Rien d'autre ne peut s'installer sans npm. Arrêt."
  exit 1
fi

# ------------------------------------------------------- 1. CLI Claude Code
head2 "Claude Code (le CLI)"

if have claude; then
  ok "déjà présent — $(claude --version 2>/dev/null | head -1)"
else
  if ask "Installer Claude Code globalement (npm i -g @anthropic-ai/claude-code) ?"; then
    if npm install -g @anthropic-ai/claude-code; then
      ok "Claude Code installé — $(claude --version 2>/dev/null | head -1)"
    else
      fail "échec de l'installation de Claude Code"
    fi
  else
    skip "Claude Code (refusé)"
  fi
fi

# --------------------------------------------- 2. plugin claude-code-setup
head2 "Claude Code Setup (plugin officiel Anthropic)"

if ! have claude; then
  skip "plugin — le CLI claude n'est pas disponible"
elif claude plugin list 2>/dev/null | grep -q "claude-code-setup"; then
  ok "déjà installé"
elif ask "Installer le plugin claude-code-setup ?"; then
  claude plugin marketplace add anthropics/claude-plugins-official >/dev/null 2>&1
  claude plugin install claude-code-setup@claude-plugins-official 2>&1 | tail -1
  # `claude plugin install` sort en 0 même quand il échoue : on ne se fie qu'à la liste.
  if claude plugin list 2>/dev/null | grep -q "claude-code-setup"; then
    ok "plugin installé — dis ensuite « recommande des automatisations pour ce projet »"
  else
    fail "le plugin n'apparaît pas dans la liste après installation"
  fi
else
  skip "plugin claude-code-setup (refusé)"
fi

# --------------------------------------------------------------- 3. Claude Mem
head2 "Claude Mem (mémoire entre sessions)"

if [ -d "$HOME/.claude-mem" ] || have claude-mem; then
  ok "déjà installé"
elif ask "Installer Claude Mem ? Il écrit des hooks dans ~/.claude/"; then
  backup_claude_settings
  if npx --yes claude-mem install; then
    ok "Claude Mem installé"
  else
    fail "échec de Claude Mem — ta sauvegarde de settings.json est intacte"
  fi
else
  skip "Claude Mem (refusé)"
fi

# ---------------------------------------------------------------- 4. Headroom
head2 "Headroom (compression de contexte)"

if have headroom; then
  ok "déjà installé — $(headroom --version 2>/dev/null | head -1)"
elif ask "Installer Headroom ?"; then
  installed=0
  if have uv; then
    uv tool install --python 3.13 "headroom-ai[all]" && installed=1
  elif have pip3; then
    pip3 install --user "headroom-ai[all]" && installed=1
  elif have pip; then
    pip install --user "headroom-ai[all]" && installed=1
  fi
  if [ "$installed" = 1 ] && have headroom; then
    ok "Headroom installé — active-le avec « headroom wrap claude », annule avec « headroom unwrap claude »"
  elif [ "$installed" = 1 ]; then
    warn "Headroom installé mais absent du PATH — ajoute ~/.local/bin à ton PATH"
  else
    fail "échec de Headroom — il faut uv ou pip (Python 3.13 recommandé)"
  fi
else
  skip "Headroom (refusé)"
fi

# --------------------------------------------------------------- 5. OmniRoute
head2 "OmniRoute (passerelle multi-fournisseurs)"

if [ "$WITH_OMNIROUTE" != 1 ]; then
  skip "OmniRoute — non installé par défaut, relance avec --with-omniroute"
  say "  ${c_dim}Il redirige tes appels vers d'autres fournisseurs : ce n'est plus Claude qui"
  say "  répond, et ton code (dont l'intégration Stripe) transite par des tiers dont les"
  say "  offres gratuites s'entraînent couramment sur ce qu'on leur envoie.${c_off}"
elif have omniroute; then
  ok "déjà installé"
elif npm install -g omniroute; then
  ok "OmniRoute installé — écoute sur http://localhost:20128/v1 une fois lancé"
else
  fail "échec d'OmniRoute"
fi

# ------------------------------------------------------------ 6. Task Observer
head2 "Task Observer"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$repo_root/.claude/skills/task-observer/SKILL.md" ]; then
  ok "déjà dans le dépôt (.claude/skills/) — rien à installer"
else
  warn "absent de .claude/skills/ — fais un « git pull » sur la branche qui le contient"
fi

# ---------------------------------------------------------------- récapitulatif
printf '\n%s================ Récapitulatif ================%s\n' "$c_b" "$c_off"
n_fail=0
for r in ${RESULTS[@]+"${RESULTS[@]}"}; do
  status="${r%%|*}"; label="${r#*|}"
  case "$status" in
    ok)   printf '  %s✓%s  %s\n' "$c_ok"   "$c_off" "$label" ;;
    warn) printf '  %s!%s  %s\n' "$c_warn" "$c_off" "$label" ;;
    skip) printf '  %s–%s  %s\n' "$c_dim"  "$c_off" "$label" ;;
    fail) printf '  %s✗%s  %s\n' "$c_err"  "$c_off" "$label"; n_fail=$((n_fail+1)) ;;
  esac
done

printf '\n'
if [ "$n_fail" -gt 0 ]; then
  say "${c_warn}$n_fail étape(s) en échec.${c_off} Les autres sont bien installées — relance le script pour réessayer."
else
  say "${c_ok}Terminé.${c_off} Redémarre Claude Code pour que tout soit pris en compte."
fi
exit 0
