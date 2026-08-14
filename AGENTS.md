# IsotopeAI Android — Agent Handoff Instructions

**Read every file inside `.agent/` before modifying any code.**

This is a multi-agent project. Multiple Replit accounts and agents will continue this work.
GitHub is the only permanent source of truth.

---

## Mandatory Reading Order

0. **`plan.md`** — The active isotope-code ↔ isotope-apk sync plan, every specification,
   and the completion gates. Follow its phase checklist; update status as you complete items.
1. `.agent/CURRENT_STATE.md` — What is done, what is broken, what to do next
2. `.agent/NEXT_TASKS.md` — Active task with exact acceptance conditions
3. `.agent/BOOTSTRAP.md` — Environment setup commands
4. `.agent/DECISIONS.md` — Architecture decisions already settled
5. `.agent/ARCHITECTURE.md` — System design and endpoint replacement map
6. `.agent/KNOWN_ISSUES.md` — Do not repeat failed approaches
7. `.agent/TEST_STATUS.md` — What has and has not been verified
8. `audit/_meta/` in the `isotope-code` repo — Source of truth for UI/data

---

## Active specifications (from plan.md — keep in sync)

- **Env (Supabase) — env-driven, backup & deploy ready (plan.md Phase 5):** the APK has **no
  runtime `.env`**, but all Supabase values are build-time env-driven. Resolution precedence:
  process env (`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_PROJECT_REF`) → root `.env`
  (git-ignored) → committed `supabase.config.json` defaults. Defaults are the current prod
  project (`vteqquoqvksshmfhuepu.supabase.co`, matching `isotope-code/.env`). No env set ⇒ output
  is byte-identical to the old hardcoded build. `scripts/prepare-www.js` rewrites the bridge/auth
  constants into `www/` from the resolved config (repo-root `android-bridge.js` stays authored);
  `scripts/apply-android-patches.js` reads the same resolver. Tooling: `scripts/deploy-supabase.js`
  (apply `supabase/*.sql` via Management API, `SUPABASE_ACCESS_TOKEN`, dry-run default) and
  `scripts/backup-supabase.js` (schema+data dump). Never commit service-role keys, PATs, or
  signing credentials — `supabase.config.json` holds public values only.
- **`deferred-scripts.js`:** `isotope-code/index.html` now references
  `<script type="module" src="/deferred-scripts.js">` (server-only endpoint in `server.mjs`
  serving PREMIUM_SCRIPT / RELOAD_GUARD_SCRIPT / FEATURE_REMOVAL_STYLE / KEY_SCRIPT /
  USERNAME_AUTH_SCRIPT). The APK has no server → **`scripts/prepare-www.js` must always strip
  this tag** (step 5c2). The Android bridge provides the equivalents (`__isoLogin`, `__isoUp`,
  upload helpers, auth fetch interception, AI config, premium via patches). Never re-add it.
- **Community SQL source of truth:** `isotope-code/sql/isotope-schema-restore.sql` (portable
  dump) + `isotope-code/sql/*.sql` migrations + `backup.sh`/`supabase-backup.mjs` (dump/restore
  pipeline). New objects to keep in the APK `supabase/` migrations: `community_join_requests`
  table, `groups.join_policy` column, `community_join_group` join-guard
  (`sql/011_community_join_guard.sql`), `community_respond_join_request`,
  `community_create_group` new signature, `community_discover_groups`, `community_update_group`,
  community events expansion. All 32 bundle RPCs must resolve in the migrated DB.
- **Never edit `isotope-code` from this repo.** It is read-only; parity is achieved by copying
  its `public/` output and SQL statements, not by forking its UI.

---

## Rules Every Agent Must Follow

1. **Read all `.agent/` files before modifying code.**
2. **Read repository audit reports and current Git history before changing anything.**
3. **Work only from the `main` branch of `isotope-apk` repo (maps to `android-production` concept).**
4. **Do not restart the project from scratch.** Continue from the current state.
5. **Do not replace working implementation merely because another architecture is preferred.**
6. **Preserve existing UI and offline-data compatibility.** The `public/` assets are the real UI.
7. **Never modify Supabase schema casually.** Document any schema change in `DECISIONS.md`.
8. **Never expose service-role keys, GitHub PATs or signing credentials** in any file.
9. **Run `npm run agent:resume` before starting implementation.**
10. **Run `npm run agent:handoff` before ending a session.**
11. **Commit and push every meaningful completed checkpoint** with a descriptive message.
12. **Update `.agent/` files in the same commit as implementation changes.**
13. **Clearly record tests that were actually executed** versus tests only inspected.
14. **Never claim a task DONE without build/test evidence.** Record the APK path or test output.
15. **If documentation conflicts with actual code**, inspect Git history and record the resolution in `DECISIONS.md`.

---

## Project Summary

**IsotopeAI Android** is a Capacitor-based Android app wrapping the existing compiled
React/Vite frontend from [Suydev/isotope-code](https://github.com/Suydev/isotope-code).

- The real application UI is pre-compiled in `isotope-code/public/assets/`.
- `src/App.tsx` in isotope-code is a **placeholder** — do not use it.
- The Android bridge (`android-bridge.js`) intercepts `/__auth/*` and `/__supa/*` fetch
  calls and routes them to direct Supabase JS client calls.
- GitHub Actions builds the APK by copying `public/` assets into `www/` and running Capacitor.

---

## Secret Names (never put values in files)

| Name | Purpose |
|------|---------|
| `GITHUB_PAT` | Repository read access for CI |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `SUPABASE_PROJECT_REF` | Supabase project reference ID |
| `SUPABASE_ACCESS_TOKEN` | Management API (owner only, not in APK) |
| `ANDROID_KEYSTORE_BASE64` | Release signing only |
| `ANDROID_KEYSTORE_PASSWORD` | Release signing only |
| `ANDROID_KEY_ALIAS` | Release signing only |
| `ANDROID_KEY_PASSWORD` | Release signing only |

---

## Quick Start for New Agent

```bash
npm run agent:resume      # Check state, install deps, show next task
npm run agent:status      # Print current status at any time
npm run agent:handoff     # Before ending session
```
