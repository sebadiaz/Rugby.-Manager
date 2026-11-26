#!/usr/bin/env bash
# Hook PreToolUse (Bash) : avant tout `git commit` qui touche le moteur ou l'IA
# des joueurs, exige que l'agent arbitre-regles-rugby ait relu CES changements.
#
# Principe : on calcule l'empreinte du diff (HEAD -> arbre de travail) des
# chemins surveillés. Si aucun changement surveillé : commit autorisé. Sinon
# le commit est refusé tant que .git/arbitre-regles-ok ne contient pas cette
# empreinte. L'empreinte est enregistrée, après le passage de l'agent, par :
#   bash .claude/hooks/arbitre-avant-commit.sh --valider <rapport.md>
# Toute modification ultérieure du moteur change l'empreinte : nouvel arbitrage.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0

CHEMINS=(engine docs/rugby-engine.js docs/rugby-ai.js)
GIT_DIR=$(git rev-parse --git-dir 2>/dev/null) || exit 0
MARQUE="$GIT_DIR/arbitre-regles-ok"
RAPPORT="$GIT_DIR/arbitre-regles-rapport.md"

empreinte() { git diff HEAD -- "${CHEMINS[@]}" 2>/dev/null | sha256sum | cut -c1-64; }
changements() { git diff HEAD --name-only -- "${CHEMINS[@]}" 2>/dev/null; }

if [ "${1:-}" = "--valider" ]; then
  src="${2:-}"
  if [ -z "$src" ] || [ ! -s "$src" ]; then
    echo "Usage : $0 --valider <fichier du rapport de l'agent arbitre-regles-rugby (non vide)>" >&2
    exit 1
  fi
  cp "$src" "$RAPPORT"
  empreinte > "$MARQUE"
  echo "Arbitrage enregistré pour l'empreinte $(cat "$MARQUE") ($(changements | wc -l) fichier(s))."
  exit 0
fi

cmd=$(jq -r '.tool_input.command // ""')
# Seules les commandes qui lancent `git ... commit` sont concernées.
printf '%s' "$cmd" | grep -Eq '(^|[;&|(`[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit([[:space:]]|$)' || exit 0

fichiers=$(changements)
[ -z "$fichiers" ] && exit 0

actuelle=$(empreinte)
if [ -f "$MARQUE" ] && [ "$(cat "$MARQUE")" = "$actuelle" ]; then
  exit 0
fi

liste=$(printf '%s' "$fichiers" | tr '\n' ' ')
raison="Commit bloqué : le moteur ou l'IA des joueurs a changé ($liste) sans arbitrage des règles du rugby sur CES changements. \
1) Lance l'agent arbitre-regles-rugby (outil Agent, subagent_type \"arbitre-regles-rugby\") en lui donnant le diff (git diff HEAD -- engine docs/rugby-engine.js docs/rugby-ai.js) et le but du patch ; il doit aussi vérifier la règle « rien n'est scripté dans les agents » de CLAUDE.md. \
2) Écris son rapport dans un fichier du scratchpad. S'il signale une violation des lois ou un comportement scripté, corrige d'abord et recommence. \
3) Sinon enregistre l'arbitrage : bash .claude/hooks/arbitre-avant-commit.sh --valider <fichier du rapport> \
4) Relance le commit. Toute nouvelle modification du moteur après l'arbitrage exige un nouvel arbitrage."

jq -n --arg r "$raison" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
