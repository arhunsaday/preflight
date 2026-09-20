#!/usr/bin/env bash
#
# Reinstalls every third-party skill this setup expects.
#
# Why this exists: `npx skills add -g` installs into the shared store at
# ~/.agents/skills/ and writes NO lockfile — only project-scoped installs are
# locked. So a global setup is not reproducible from a lockfile, and this list
# is the reproducibility mechanism instead.
#
#   ./install-third-party.sh          install everything
#   ./install-third-party.sh --list   show what each repo contains, install nothing
#
set -uo pipefail

REPOS=(
  obra/superpowers                  # tdd, systematic-debugging, brainstorming, writing-plans, verification-before-completion
  addyosmani/agent-skills           # production engineering: review, security, perf, observability, migration
  anthropics/skills                 # official: docx/pptx/xlsx/pdf, mcp-builder, skill-creator
  mattpocock/skills                 # TypeScript: tdd, pr, research, wizard, codebase-design
  RobMitt/grill-me-skill            # relentless interview until shared understanding
  elayadesign/ai-design-skills      # landing-page-design
  dmmulroy/anti-slop                # oxlint rules rejecting low-evidence code
  s1dashu/ip-as-logo-skill          # character/logo generation
  LukasNiessen/kubernetes-skill     # manifests, Helm, Kustomize, EKS/GKE/AKS/OpenShift
  firecrawl/anydoc                  # any document -> markdown
)

# emilkowalski/skills is installed selectively: its `prototype` collides with
# mattpocock's, which is already installed and is the one we want. Everything
# else in that repo is motion/design craft and worth having.
EMIL_SKILLS=(
  animate animate-expo animation-vocabulary apple-design ask-sonner
  emil-design-eng find-animation-opportunities improve-animations
  mobile-native pick-ui-library review-animations write-swift
)

MODE="${1:-install}"

for r in "${REPOS[@]}"; do
  printf '\n\033[1m=== %s\033[0m\n' "$r"
  if [ "$MODE" = "--list" ]; then
    npx -y skills@latest add "$r" -l 2>&1 | tail -20
  else
    npx -y skills@latest add "$r" --all -g 2>&1 | tail -4
  fi
done

printf '\n\033[1m=== emilkowalski/skills (selective)\033[0m\n'
if [ "$MODE" = "--list" ]; then
  npx -y skills@latest add emilkowalski/skills -l 2>&1 | tail -20
else
  # One at a time: a comma-separated -s list is not honoured by the CLI.
  for s in "${EMIL_SKILLS[@]}"; do
    npx -y skills@latest add emilkowalski/skills -g -y -s "$s" >/dev/null 2>&1
    [ -d "$HOME/.agents/skills/$s" ] && printf '  ok  %s\n' "$s" || printf '  KO  %s\n' "$s"
  done
fi

[ "$MODE" = "--list" ] && exit 0

printf '\n\033[1m=== installed\033[0m\n'
ls ~/.agents/skills 2>/dev/null | wc -l | xargs printf '%s skills in the shared store (~/.agents/skills)\n'
echo "Every agent on this machine reads that store — Claude Code, Cursor, Codex, Copilot and ~50 others."
