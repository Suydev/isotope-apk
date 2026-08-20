# IsotopeAI Android — build & parity plan

**Status:** ACTIVE
**Target:** keep `isotope-apk` at full parity with the committed `www/` UI and the
new Supabase community schema, and keep the APK fully self-contained (no upstream
web source checkout required for builds or tests).
**Source of truth:** the APK's committed `supabase/` migrations (ported from the
upstream schema/SQL dumps) + committed `www/` (pre-compiled UI). The web app
source is no longer part of this repo's build or test pipeline.
**Repos:**
- `/data/data/com.termux/files/home/isotope-apk` — Capacitor Android wrapper (this repo, editable)
- `www/` — committed pre-compiled web UI (source of truth for the app)

---

## 0. Verified facts (2026-08-14)

1. **Bridge regression found & fixed.** The working tree of `isotope-apk` had `android-bridge.js`
   overwritten with a broken 176-line TypeScript stub (`import type`, `declare global`, `(s: any)`
   — invalid browser JS that would crash the WebView on load; auth was simulated, not Supabase).
   Restored the real 4361-line bridge from `HEAD`.
   - md5 parity confirmed: `HEAD:android-bridge.js` == `www/android-bridge.js` ==
     `isotope-code/isotope-apk-ref/android-bridge.js` == `ad01e218f46bb49d0c5ab0a5e1031c8b`.
2. **New `index.html` deferred-scripts tag.** Current `isotope-code/index.html` adds
   `<script type="module" src="/deferred-scripts.js">` which is served by `server.mjs` and bundles
   `PREMIUM_SCRIPT`, `RELOAD_GUARD_SCRIPT`, `FEATURE_REMOVAL_STYLE`, `KEY_SCRIPT`,
   `USERNAME_AUTH_SCRIPT`. There is **no Node server inside the APK**, so this tag must be stripped.
   - `android-bridge.js` already provides the Android equivalents: `__isoLogin`, `__isoUp`,
     `__isoUploadBackupJSON`, `__isoUploadGroupIcon`, `__isoUploadStudyMaterial`, auth fetch
     interception, AI config at `/api/ai-config`, and premium is enforced by patches
     (`planType:"free"` → `"ranker"`, gate removal).
   - **Fix applied:** `scripts/prepare-www.js` step `5c2` strips `/deferred-scripts.js`.
3. **Uncommitted isotope-code changes that must flow into www/:**
   - `index.html` → +`/deferred-scripts.js` (handled by 5c2).
   - `public/pwa-local.js` → SW version persisted in `sessionStorage` (one-shot reload guard) +
     potato mode (`isotope_potato_mode` → 30s polling). `pwa-local.js` is **disabled** in the APK.
   - `public/ux-setup.js` → potato-mode CSS (`#isotope-potato-mode`). Copied as-is into www/.
   - `server.mjs` → deferred-scripts endpoint + docs badge. Server-only, not in APK.
4. **www/ rebuilt** from current isotope-code: 129 JS bundles, 53.7 MB.
   - Bundle hashes are **identical** to the previous pinned build (130 non-KaTeX assets match),
     so every minified-JS patch in `apply-android-patches.js` is expected to still apply.
   - `apply-android-patches.js` has **NOT yet been run** on the fresh www/ → Phase 3.
5. **Env parity confirmed.** `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `isotope-code/.env` match the
   hardcoded values in `android-bridge.js` (`vteqquoqvksshmfhuepu.supabase.co`). No code change.
   - The APK intentionally **hardcodes** Supabase env in `android-bridge.js` + `apply-android-patches.js`
     (there is no runtime `.env` in a WebView). Any Supabase project change must update **both** files.
6. **Community SQL — new statements in isotope-code:**
   - `sql/011_community_join_guard.sql` — **NEW** (2026-08-09): rewrites `community_join_group` so an
     owner/existing member joining a request-policy group returns `{"status":"member"}` instead of
     creating a phantom self-request in `community_join_requests`.
   - `sql/009_community_hardening.sql` — newer hardened version (differs from the APK root copy).
   - `sql/010_cleanup_group_members_rls.sql` — differs from APK `supabase/011_fix_rls_recursion.sql`
     (which is a stale stub pointing at a file that no longer exists upstream — it was renamed to
     `011_community_join_guard.sql`).
   - `sql/isotope-schema-restore.sql` — 4244-line portable schema dump. Contains the new schema:
     `community_join_requests` table, `groups.join_policy` column, and RPCs
     `community_join_group`, `community_respond_join_request`, `community_create_group` (new
     signature), `community_discover_groups`, `community_update_group`, etc.
   - `sql/isotope-data-backup.jsonl` — 4089-line data dump.
   - Root: `community-patch-v4.sql`, `community-patch-v6.sql`, `events-expansion.sql`,
     `performance-*.sql`, `isotope-complete.sql`, `isotope-schema.sql`.
7. **RPC contract satisfied.** All **32** RPCs called by the built bundles
   (`www/assets/communityApi-*.js` etc.) exist in `isotope-schema-restore.sql`
   (checked one-by-one). The bundles call Supabase RPCs **directly** via supabase-js (no
   `/__auth` interception for community RPCs), so the DB must be migrated to the new dump, not the bridge.
8. **Bridge RPC surface** (fetch interception): `/__auth/*` (login, signup, bootstrap, profile,
   backup/restore, onboarding, storage, snapshot) and `/__supa/functions/v1/*`
   (finish-session, get-leaderboard, get-daily-leaderboard, get-group-leaderboard,
   get-group-analytics). No change required for community RPCs.
9. **Tests:** 6 files under `test/` (`android-bridge`, `android-layout-parity`,
   `floating-timer-bridge`, `floating-timer-native`, `latex-rendering`, `prepare-patches`).
   Baseline was 63/63 PASS on the previous pinned build; must pass again after the www rebuild.

---

## Phase 1 — Bridge stability (DONE ✅)

- [x] Revert broken `android-bridge.js` TS stub → restore real bridge from `HEAD`.
- [x] Confirm md5 parity across `HEAD`, `www/`, `isotope-apk-ref`.
- [ ] (keep) untracked `scripts/pull-production-assets.js` — decide whether to commit (see Phase 4 note).
- **Gate:** `grep -c "__isoLogin" android-bridge.js` > 0 and `node --check android-bridge.js` passes.

## Phase 2 — prepare-www.js parity (DONE ✅)

- [x] Strip `/deferred-scripts.js` module tag (step 5c2, with explanatory comment).
- [x] All existing steps intact (bridge injection, pwa-local/update-checker disable, viewport,
      PWA meta removal, boot splash, restore-and-launch bootstrap patches, sw.js no-op,
      workbox neuter, KaTeX font repair, PWA artifact pruning).
- **Gate:** re-run `prepare-www.js` → logs `✓ deferred-scripts.js disabled`.

## Phase 3 — www/ rebuild + patch verification

> **2026-08-20 — SUPERSEDED:** `apply-android-patches.js` was **deleted**. The build no
> longer patches bundles at build time; Android integration is baked into the
> committed `www/` (validated by the CI "Validate www/ JS syntax" step). The
> gates below that reference the patch script are therefore N/A.

- [x] `REPO_DIR=.../web-source node scripts/prepare-www.js` → 129 bundles, 53.7 MB.
- [x] `node scripts/apply-android-patches.js` — **REMOVED (2026-08-20)**, see note above.
- [ ] Spot-verify patch markers in `www/assets/`:
      - `useAuthStore-*`: `planType:"ranker"`
      - `AppAccessGate-*`: `isotope-auth-token` absent from cleanup Set
      - `Focus-*`: `__isoOpenFloatingTimer` present
      - `useOnlineStatus-*`: `isotope:network` listener present
      - `Auth-*`: `__isoLogin` Android branch present
      - `CommunityHub-*`: events/calendar filtered on Android
      - `SingleGroup-*`: premium gates removed (`isPremium` → `!0`)
- [ ] Confirm `www/index.html` contains: bridge injection, boot splash, NO `deferred-scripts.js`,
      NO `pwa-local.js`, NO `update-checker.js`.
- **Gate:** zero failures; all spot-checks green.

## Phase 4 — Community SQL sync (env + schema + migrations)

- [ ] **Naming fix:** replace stale `supabase/011_fix_rls_recursion.sql` stub with the real
      community join-guard SQL content (preserve the 010 RLS work already
      applied in prod; verify the two files don't regress each other — the join-guard is additive
      on top of 010).
- [ ] **009 parity:** sync the upstream `009_community_hardening.sql` (new version) into this
      repo root `009_community_hardening.sql` so root/ref copies match upstream.
- [ ] **010 parity:** sync the upstream `010_cleanup_group_members_rls.sql` — verify against the
      APK's `013*` migrations for ordering/conflicts (013c/013d contain grants + FK + profile-read
      hardening that the dump also carries; do not duplicate or drop them).
- [ ] **New schema (from dump):** `community_join_requests` table + `groups.join_policy` column +
      new/updated RPCs (`community_join_group` join-guard, `community_respond_join_request`,
      `community_create_group` new signature, `community_discover_groups`, `community_update_group`,
      `community_transfer_group`, buddy/quiet-hours/start-alert RPCs). Represent these as a new
      idempotent migration file in `supabase/` (e.g. `014_join_policy_join_requests.sql`) mirroring
      the dump's DDL/RPC/policies/grants for the affected objects only.
- [ ] **Events expansion:** `events-expansion.sql` (`community_events`, `community_event_attendees`,
      `join/leave_community_event` RPCs, store items) — add to the same migration if not already in
      the dump (verify: `create_community_event`, `join_community_event` present in dump ✓).
- [ ] **Seed/data parity:** `012_seed_community_data.sql` still matches current `groups` schema
      (join_policy default `request`, new columns); update seeds to include `join_policy` if the
      insert column list changed.
- [ ] **Apply to prod Supabase** (project `vteqquoqvksshmfhuepu`) via management API/CLI using the
      `SUPABASE_PAT`/`SUPABASE_ACCESS_TOKEN` secret: run 011_join_guard + new 014 migration.
      Record evidence (API response / psql log) in `.agent/`.
- [ ] **pull-production-assets.js:** decide fate. It targets production hashes (e.g.
      `Community-CP21roB4.js`) that are NOT the current local bundle hashes — mark it stale or
      update its hash list, else it will download mismatched assets. Recommended: commit it but add
      a header warning + make it verify hashes against `public/index.html` before writing.
- **Gate:** every RPC in the bundle contract (32 listed in §0.7) resolves against the migrated DB;
      `npm test` still passes.

## Phase 5 — Env-driven Supabase config (backup & deploy ready)

**Decision (2026-08-14):** the APK must stop being hardcoded-only. Keep the current prod values as
**defaults**, but make every Supabase value resolvable from environment/build-time config so a
future Supabase backup/rotation/deploy targets a different project without source edits.

### 5.1 Single source of config
- [ ] Create `supabase.config.json` (committed) with the current prod defaults:
      `{ "url": "https://vteqquoqvksshmfhuepu.supabase.co",
         "anonKey": "<anon>", "projectRef": "vteqquoqvksshmfhuepu" }`.
      Anon key is public (client-safe) — service-role keys stay in secrets only, never committed.
- [ ] Env override precedence (highest first):
      1. `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_PROJECT_REF` process env
      2. values in `.env` at repo root if present (parse manually — no new dependency)
      3. `supabase.config.json` defaults.
- [ ] `projectRef` is derived automatically from `SUPABASE_URL` when not set explicitly.

### 5.2 Consume config in the build chain
- [x] `scripts/prepare-www.js` — rewrites bridge/auth constants (`SUPA_URL`, `SUPA_ANON_KEY`,
      `ref = '...'`, `sb-<ref>-auth-token` storage keys) from the resolved config, so the
      generated `www/android-bridge.js` and
      `www/auth-bridge.js` target the configured project. Defaults stay byte-identical to today
      when no env is set (parity preserved).
- [ ] `android/app/src/main/assets/public/*` copies (`cap sync`) inherit this automatically.
- [ ] Keep `android-bridge.js` (repo root) as the authored source with the current prod literals;
      the rewrite happens in `www/` only, so git diff stays clean on config changes.

### 5.3 Backup & deploy tooling (future-proofing)
- [ ] `scripts/deploy-supabase.js` — apply `supabase/*.sql` migrations (in filename order) to the
      target project via the Supabase Management API (uses `SUPABASE_ACCESS_TOKEN` secret env,
      `--project-ref` flag, dry-run by default). Replaces the manual SQL-editor workflow.
- [ ] `scripts/backup-supabase.js` — mirror of the upstream `backup.sh`: dump schema
      (`schema-dump.mjs`-style) + data to `backups/isotope-backup-<ts>/` using
      `SUPABASE_ACCESS_TOKEN` (+ service role for storage when available).
- [ ] Document in README: `SUPABASE_URL=... SUPABASE_ANON_KEY=... npm run build` for a new
      project; `SUPABASE_ACCESS_TOKEN=... node scripts/deploy-supabase.js --project-ref <ref> --dry-run`
      to migrate; `node scripts/backup-supabase.js` to dump.
- [ ] Wire npm scripts: `build:env` (env-driven build), `supabase:deploy`, `supabase:backup`.
- [ ] `.env` is git-ignored; `supabase.config.json` is committed (public values only).

### 5.4 Parity guardrails
- [ ] Verify `SUPABASE_PROJECT_REF` derivation matches the storage key refs in the bridge
      (`sb-<ref>-auth-token`) so sessions survive config-driven builds.
- [ ] `npm test` includes a test asserting the config resolver: no env → prod defaults;
      env set → override wins; `.env` beats config file, env beats `.env`.
- [ ] `backup.sh` / `supabase-backup.mjs` / `schema-dump.mjs` stay **upstream-side**; the APK
      consumes `sql/isotope-schema-restore.sql` as reference only (documented in README).

## Phase 6 — Tests & verification

- [ ] `npm test` → expect 63/63 PASS (baseline) after Phase 3 rebuild + Phase 4 SQL edits.
- [ ] `node --check` on `android-bridge.js`, `scripts/prepare-www.js`.
- [ ] Record actual-vs-inspected tests in `.agent/TEST_STATUS.md` (rule 13).

## Phase 7 — Docs, commit, push

- [ ] Update `.agent/CURRENT_STATE.md`, `.agent/NEXT_TASKS.md`, `.agent/SESSION_LOG.md`
      (new session entry: bridge restore, deferred-scripts handling, www rebuild, community SQL).
- [ ] Update `AGENTS.md` (already references this plan — keep pointer + phase status current).
- [ ] `git add` only intended files (never `.env*`, never secrets). Commit message style: concise,
      descriptive, matches history (e.g. `fix: sync apk with deferred-scripts + community join-guard SQL`).
- [ ] Push to `main` immediately (repo rule: every completed fix pushed right away).

---

## Completion gates (definition of DONE)

1. `android-bridge.js` is the real bridge; `node --check` clean.
2. `prepare-www.js` handles `deferred-scripts.js`; re-run shows no ERROR/exit.
3. Committed `www/` parses cleanly as modules (CI validates every `www/` JS file); build runs
   `prepare-www` → `cap sync` with no patch step.
4. All 32 bundle RPCs exist in migrated Supabase schema; join-guard + join_requests/join_policy
   migration applied to prod with evidence.
5. `npm test` green (63/63 or documented equivalent).
6. Supabase values are env-driven (env → .env → `supabase.config.json` defaults); prod defaults
   byte-identical output when no env set; `deploy-supabase.js` + `backup-supabase.js` committed
   with npm scripts; resolver covered by a test.
7. `plan.md`, `AGENTS.md`, `.agent/*` updated in the same commit; pushed to `main`.
