#!/usr/bin/env bash
# agent-resume.sh
# Brings a new agent up to speed. Run this before starting any implementation work.
# Usage: npm run agent:resume

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BOLD='\033[1m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
CYAN='\033[36m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err()  { echo -e "${RED}✗${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
sep()  { echo -e "${BOLD}───────────────────────────────────────${RESET}"; }

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  IsotopeAI Android — Agent Resume     ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════╝${RESET}"
echo ""

# ── 1. Confirm repo root ─────────────────────────────────────────────────────
sep
echo -e "${BOLD}1. Confirming repository root${RESET}"

if [[ ! -f "$ROOT/capacitor.config.json" ]]; then
  err "Not in isotope-apk repo root. Expected capacitor.config.json."
  err "Run: cd /path/to/isotope-apk"
  exit 1
fi
ok "Repo root: $ROOT"

# ── 2. Git state ─────────────────────────────────────────────────────────────
sep
echo -e "${BOLD}2. Git state${RESET}"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
SHA=$(git rev-parse HEAD 2>/dev/null | head -c12 || echo "no-commits")
ok "Branch: $BRANCH"
ok "Commit: $SHA"

# ── 3. Fetch remote ──────────────────────────────────────────────────────────
sep
echo -e "${BOLD}3. Fetching from GitHub${RESET}"

if git fetch origin 2>/dev/null; then
  ok "Fetched from origin"
else
  warn "Could not fetch (no PAT configured or offline)"
fi

# Check ahead/behind
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "?")
BEHIND=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo "?")

if [[ "$BEHIND" != "0" && "$BEHIND" != "?" ]]; then
  warn "Branch is $BEHIND commits BEHIND remote"
  warn "Review remote changes before proceeding:"
  warn "  git log HEAD..@{u} --oneline"
  warn ""
  warn "DO NOT run 'git reset --hard origin/$BRANCH' without reviewing"
  warn "unless you are certain no local changes need preserving."
fi

if [[ "$AHEAD" != "0" && "$AHEAD" != "?" ]]; then
  warn "Branch is $AHEAD commits AHEAD of remote — push when ready"
fi

# ── 4. Check for uncommitted changes ─────────────────────────────────────────
sep
echo -e "${BOLD}4. Working tree check${RESET}"

CHANGES=$(git --no-optional-locks status --porcelain 2>/dev/null || echo "")
if [[ -n "$CHANGES" ]]; then
  warn "Uncommitted changes present:"
  echo "$CHANGES" | head -20
  echo ""
  warn "Review these before making new changes."
  warn "DO NOT discard uncommitted work without understanding what it is."
else
  ok "Working tree is clean"
fi

# ── 5. Install dependencies ───────────────────────────────────────────────────
sep
echo -e "${BOLD}5. Installing dependencies${RESET}"

if [[ -f package.json ]]; then
  if [[ ! -d node_modules ]]; then
    info "node_modules missing — running npm install"
    npm install --no-fund --no-audit 2>&1 | tail -5
    ok "Dependencies installed"
  else
    ok "node_modules present"
  fi
else
  err "package.json not found!"
  exit 1
fi

# ── 6. Validate key config files ─────────────────────────────────────────────
sep
echo -e "${BOLD}6. Validating key configuration${RESET}"

FILES_OK=true
check_file() {
  if [[ -f "$ROOT/$1" ]]; then
    ok "$1"
  else
    err "$1 — MISSING"
    FILES_OK=false
  fi
}

check_file "capacitor.config.json"
check_file "android-bridge.js"
check_file "scripts/prepare-www.js"
check_file ".github/workflows/android.yml"
check_file ".agent/state.json"
check_file ".agent/CURRENT_STATE.md"
check_file ".agent/NEXT_TASKS.md"

if [[ "$FILES_OK" == "false" ]]; then
  err "Some required files are missing. Check FILE_MAP.md."
fi

# ── 7. Print .agent/ state summaries ─────────────────────────────────────────
sep
echo -e "${BOLD}7. Current state summary${RESET}"
echo ""

if [[ -f "$ROOT/.agent/CURRENT_STATE.md" ]]; then
  echo -e "${BOLD}--- CURRENT_STATE.md (first 40 lines) ---${RESET}"
  head -40 "$ROOT/.agent/CURRENT_STATE.md"
  echo ""
fi

# ── 8. Active task ────────────────────────────────────────────────────────────
sep
echo -e "${BOLD}8. Active task${RESET}"
echo ""

if [[ -f "$ROOT/.agent/NEXT_TASKS.md" ]]; then
  # Extract ACTIVE task block
  python3 -c "
import re, sys
text = open('.agent/NEXT_TASKS.md').read()
m = re.search(r'(### TASK \S+.*?Status:\*\* ACTIVE.*?)(?=### TASK |\Z)', text, re.DOTALL)
if m:
    print(m.group(1)[:2000])
else:
    print('No ACTIVE task found. Check NEXT_TASKS.md manually.')
" 2>/dev/null || grep -A 30 "Status:\*\* ACTIVE" "$ROOT/.agent/NEXT_TASKS.md" | head -35 || echo "No active task found"
fi

# ── 9. Blocking issues ────────────────────────────────────────────────────────
sep
echo -e "${BOLD}9. Known issues${RESET}"

if [[ -f "$ROOT/.agent/KNOWN_ISSUES.md" ]]; then
  grep -E "^## ISSUE|Severity|Status" "$ROOT/.agent/KNOWN_ISSUES.md" | head -30
fi

# ── 10. Tool versions ─────────────────────────────────────────────────────────
sep
echo -e "${BOLD}10. Tool versions${RESET}"

NODE_VER=$(node --version 2>/dev/null || echo "NOT FOUND")
NPM_VER=$(npm --version 2>/dev/null || echo "NOT FOUND")
JAVA_VER=$(java -version 2>&1 | head -1 || echo "NOT FOUND")
GRADLE_VER=$([[ -f android/gradlew ]] && android/gradlew --version 2>/dev/null | grep "^Gradle " || echo "not initialized")

echo "  Node.js: $NODE_VER"
echo "  npm:     $NPM_VER"
echo "  Java:    $JAVA_VER"
echo "  Gradle:  $GRADLE_VER"

# Node version check
NODE_MAJOR=$(node --version 2>/dev/null | cut -d. -f1 | tr -d 'v' || echo "0")
if [[ "$NODE_MAJOR" -lt "18" ]]; then
  warn "Node.js $NODE_VER is below minimum (18.x). Install Node.js 20.x."
fi

# ── Summary ───────────────────────────────────────────────────────────────────
sep
echo -e "${BOLD}RESUME COMPLETE${RESET}"
echo ""
echo "You are operational. Proceed with the ACTIVE task above."
echo ""
echo -e "Quick commands:"
echo -e "  ${CYAN}npm run agent:status${RESET}   — print full status at any time"
echo -e "  ${CYAN}npm run agent:handoff${RESET}  — run before ending session"
echo ""
