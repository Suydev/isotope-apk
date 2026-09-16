#!/usr/bin/env bash
# switch.sh — one entrypoint for moving the app between Supabase projects and
# for the auth config the schema cannot hold.
#
#   ./switch.sh auth    --ref abc123 --urls https://app.example/** [--site-url URL] [--dry-run]
#   ./switch.sh migrate --ref abc123 [--from 025] [--only 025] [--list] [--dry-run]
#   ./switch.sh repoint --url URL [--anon-key KEY] [--ref abc123] [--dry-run]
#   ./switch.sh verify  --ref abc123
#   ./switch.sh projects
#   ./switch.sh backup
#   ./switch.sh full    --ref NEW --url https://NEW.supabase.co --anon-key KEY \
#                       --urls https://app.example/** --site-url https://app.example [--no-backup]
#
# `full` is the whole move: back up the current backend, apply migrations, set
# auth config, repoint the client, then verify. The same args are handed to each
# step; a step ignores the flags it does not use.
#
# The token comes from SUPABASE_ACCESS_TOKEN, or the gitignored .pat file.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN=("$ROOT/scripts/backend-switch.mjs")

say()  { printf '\033[1;32m[switch]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[switch]\033[0m ERROR: %s\n' "$*" >&2; exit 1; }

load_pat() {
  if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" && -f "$ROOT/.pat" ]]; then
    SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' < "$ROOT/.pat")"
  fi
  if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    printf '\033[1;33m[switch]\033[0m no token found (set SUPABASE_ACCESS_TOKEN or create .pat); verbs that need one will fail\n' >&2
  fi
  export SUPABASE_ACCESS_TOKEN
}

current_url() {
  node -e "try{process.stdout.write(require('$ROOT/supabase.config.json').url||'')}catch(e){}"
}

cmd_full() {
  command -v node >/dev/null 2>&1 || die "node.js required"
  load_pat
  [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] || die "full needs a token — create .pat or export SUPABASE_ACCESS_TOKEN"
  local no_backup=0 args=()
  for a in "$@"; do
    case "$a" in --no-backup) no_backup=1 ;; *) args+=("$a") ;; esac
  done
  if [[ "$no_backup" -eq 0 ]]; then
    local url; url="$(current_url)"
    [[ -n "$url" ]] || die "cannot read the current backend URL from supabase.config.json"
    say "step 1/5: backup current backend ($url)"
    "$ROOT/backup.sh" backup --pat "$SUPABASE_ACCESS_TOKEN" --supabase-url "$url" \
      || die "backup failed — switch aborted (pass --no-backup to override)"
  else
    say "step 1/5: backup skipped (--no-backup)"
  fi
  say "step 2/5: apply migrations"
  node "${BIN[@]}" migrate "${args[@]+"${args[@]}"}"
  say "step 3/5: configure auth"
  node "${BIN[@]}" auth "${args[@]+"${args[@]}"}"
  say "step 4/5: repoint client"
  node "${BIN[@]}" repoint "${args[@]+"${args[@]}"}"
  say "step 5/5: verify"
  node "${BIN[@]}" verify "${args[@]+"${args[@]}"}"
  say "switch complete → $(current_url)"
}

cmd_backup() {
  command -v node >/dev/null 2>&1 || die "node.js required"
  load_pat
  [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] || die "backup needs a token — create .pat or export SUPABASE_ACCESS_TOKEN"
  local url extra=()
  url="$(current_url)"
  [[ -n "$url" ]] && extra=(--supabase-url "$url")
  "$ROOT/backup.sh" backup --pat "$SUPABASE_ACCESS_TOKEN" \
    "${extra[@]+"${extra[@]}"}" "$@"
}

load_pat

case "${1:-}" in
  full)   shift; cmd_full "$@" ;;
  backup) shift; cmd_backup "$@" ;;
  "")     cat <<'USAGE'
usage: ./switch.sh {auth|migrate|repoint|verify|projects|backup|full} [args…]

  auth     --ref REF [--urls U,…] [--site-url U] [--google-client-id ID] [--google-secret S]
  migrate  --ref REF [--from 025] [--only 025] [--list] [--dry-run]
  repoint  [--url U] [--anon-key K] [--ref REF] [--dry-run]
  verify   --ref REF
  projects
  backup
  full     --ref NEW --url U --anon-key K [--urls U,…] [--site-url U] [--no-backup]

Token: SUPABASE_ACCESS_TOKEN env, or the gitignored .pat file.
See scripts/backend-switch.mjs for what each verb does.
USAGE
  ;;
  *) exec node "${BIN[@]}" "$@" ;;
esac
