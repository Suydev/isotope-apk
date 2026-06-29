# IsotopeAI Android — Architecture Decisions

---

## DEC-001 — Capacitor over React Native rewrite

**Date:** 2026-06-28
**Context:** Converting IsotopeAI (a Node.js + React/Vite web app) to Android.
**Options considered:**
1. Full React Native rewrite — months of work, UI parity impossible
2. Capacitor WebView wrapper — preserves all 211 JS chunks and existing UI exactly
3. TWA (Trusted Web Activity) — requires live server, no true offline

**Chosen:** Capacitor WebView wrapper

**Why:** The real UI is pre-compiled in `public/assets/` (211 JS chunks, 342KB main bundle). Rewriting would take months and could never achieve UI parity. Capacitor lets us ship the identical compiled frontend as a bundled Android app.

**Consequences:**
- APK is ~80MB+ (includes all JS assets and WAV sound files)
- No native navigation gestures — WebView scroll behavior
- Sound files (42MB WAV) should be converted to OGG/AAC in a future task

**Files affected:** `capacitor.config.json`, `package.json`, `.github/workflows/android.yml`
**Reversible:** Yes — the React Native path is always available later

---

## DEC-002 — Fetch interceptor over native Kotlin plugins

**Date:** 2026-06-28
**Context:** The app uses `/__auth/*` and `/__supa/*` server endpoints that must be replaced.
**Options considered:**
1. Kotlin plugins that bridge WebView → Java code
2. JavaScript fetch() interceptor in WebView

**Chosen:** JavaScript fetch interceptor (`android-bridge.js`)

**Why:** All auth/backup/sync logic is already implemented in the existing JS bundles (auth-bridge.js, backup-normalizer.js, local-data-adapter.js). The bridge intercepts `window.fetch` and routes known paths to direct Supabase calls, eliminating the need to rewrite any Kotlin. Capacitor's WebView runs full ES6+ JS, so this is clean and maintainable.

**Consequences:**
- Bridge must be the FIRST script loaded in `<head>` of index.html
- All /__auth/* response shapes must exactly match what server.mjs returns
- Any new server endpoint needs a bridge handler added

**Files affected:** `android-bridge.js`, `scripts/prepare-www.js`
**Reversible:** Yes — Kotlin plugin approach is still possible

---

## DEC-003 — Bundle assets locally (no remote WebView)

**Date:** 2026-06-28
**Context:** Whether to load assets from a remote URL or bundle them in the APK.
**Options considered:**
1. Remote WebView — fast updates but requires network to launch
2. Bundle all assets in www/ — truly offline, self-contained APK

**Chosen:** Bundle all assets in www/

**Why:** IsotopeAI is advertised as offline-first. Android users expect offline launch. Capacitor's default is bundled assets. Remote loading would require a CDN and defeat the offline-first goal.

**Consequences:**
- APK size is large (80MB+)
- Updates require new APK release (no hot updates)
- Sound files (42MB) should be converted to OGG to reduce size

**Files affected:** `capacitor.config.json` (webDir: "www"), `scripts/prepare-www.js`
**Reversible:** Yes — capacitor.config.json server.url can point to remote

---

## DEC-004 — Service worker disabled in Android context

**Date:** 2026-06-28
**Context:** Capacitor WebView and service workers have known conflicts.
**Options considered:**
1. Keep service worker active — cache management complexity
2. Replace with no-op SW — simpler, assets already bundled

**Chosen:** Replace sw.js with a no-op service worker

**Why:** Capacitor bundles all assets locally — the service worker cache is redundant. SW in Capacitor can cause stale asset loops and navigation issues. The no-op SW prevents 404s if any code tries to register it.

**Consequences:**
- No SW-based offline fallback (not needed — assets are bundled)
- No push notifications via SW (will use @capacitor/local-notifications instead)

**Files affected:** `scripts/prepare-www.js` (patches sw.js)
**Reversible:** Yes — remove the SW noop patch

---

## DEC-005 — Direct Supabase calls (not via /__supa proxy)

**Date:** 2026-06-28
**Context:** The web app proxies all Supabase calls through `/__supa/*` on the local server.
**Options considered:**
1. Keep /__supa proxy — intercept and forward to Supabase directly
2. Direct Supabase calls — bypass proxy entirely

**Chosen:** Intercept /__supa/* and forward to Supabase directly (option 1)

**Why:** The existing JS bundles already use /__supa/* URLs hardcoded throughout 211 chunks. Changing them all to direct Supabase URLs would require recompiling. The bridge intercepts and forwards transparently.

**Consequences:**
- android-bridge.js `handleSupaProxy()` must handle all /__supa/* paths
- RPC calls via `supabase.functions.invoke()` also use this path

**Files affected:** `android-bridge.js`
**Reversible:** N/A — this is a transparent proxy

---

## DEC-006 — Supabase anon key hardcoded in android-bridge.js

**Date:** 2026-06-28
**Context:** The anon/publishable key must be available in the APK for Supabase calls.
**Options considered:**
1. Build-time injection via Gradle variables
2. Hardcode in android-bridge.js (which is bundled in www/)
3. Runtime fetch from a config endpoint

**Chosen:** Hardcode in android-bridge.js

**Why:** The anon key is a publishable/public key — it is designed to be embedded in client applications. Supabase's RLS policies protect data. The service-role key is NEVER included. This is the same pattern used by every Supabase mobile app.

**Consequences:**
- Anon key is visible in the APK (expected and safe for publishable keys)
- Service-role key must NEVER be added to any client file
- If the anon key changes, a new APK must be released

**Files affected:** `android-bridge.js`
**Reversible:** Yes — can switch to Gradle build config injection

---

## DEC-007 — WAV sound files included as-is

**Date:** 2026-06-28
**Context:** rain.wav (14.8MB), wind.wav (17.1MB), crickets.wav (11.9MB) = 43.8MB total.
**Options considered:**
1. Include as-is (WAV) — simple but 43.8MB added to APK
2. Convert to OGG — ~80% size reduction, Android native format
3. Exclude sounds — breaks ambient sound feature

**Chosen:** Include as-is for MVP; convert to OGG in future task

**Why:** OGG conversion requires ffmpeg which is not available in basic CI. For MVP, functionality is more important than APK size. Android's WebView supports WAV audio.

**Consequences:**
- APK download size is significantly larger than necessary
- Should be addressed before Play Store release (Play Store warns on APK >100MB)

**Files affected:** `www/sounds/` (populated by prepare-www.js)
**Reversible:** Yes — future task ANDROID-009

---

## DEC-008 — GitHub Actions for APK builds (not local)

**Date:** 2026-06-28
**Context:** Building APKs requires Android SDK + Java + Gradle. Replit doesn't have this.
**Options considered:**
1. Build locally in Replit — Android SDK not available
2. GitHub Actions — available for free on public repos

**Chosen:** GitHub Actions CI (.github/workflows/android.yml)

**Why:** Replit does not have the Android SDK. GitHub Actions has free minutes for public repos and provides the full build environment.

**Consequences:**
- Builds take ~10-15 minutes in CI
- Must push to GitHub to trigger a build
- APK is uploaded as a GitHub Actions artifact (download from Actions tab)

**Files affected:** `.github/workflows/android.yml`
**Reversible:** Yes — any CI provider can be used

---

## DEC-009 — src/App.tsx is a placeholder; DO NOT use it

**Date:** 2026-06-28
**Context:** The isotope-code repository has src/App.tsx.
**Decision:** This file contains only "Replit Agent is building..." and is NOT the production UI.
**Why:** The production React app is pre-compiled in public/assets/. There is no rebuild path from src/ to the production public/assets/ (the source code for Dashboard, Timer, etc. is not in src/).
**Consequences:** Never run `npm run build` expecting it to produce the production UI. Always use public/ as-is.
**Files affected:** N/A — just awareness
**Reversible:** N/A

---

## DEC-010 — Commit the Android native project

**Date:** 2026-06-29
**Context:** CI previously recreated the Android platform with `npx cap add android`, which can discard native manifest, Gradle, resource, and Kotlin customizations.

**Chosen:** Generate the Android project once, commit `android/`, and make CI run `npx cap sync android`.

**Why:** Native configuration is production code. Recreating the platform during every build makes notification, permission, manifest, SDK, and Gradle changes unreliable.

**Consequences:**
- `android/` is now part of the repair branch.
- CI applies native patches before and after `npx cap sync android`.
- Build output and copied web assets remain ignored.

---

## DEC-011 — Pin isotope-code source commit for APK builds

**Date:** 2026-06-29
**Context:** Packaging whatever happens to be latest on `isotope-code/main` makes Android builds non-deterministic.

**Chosen:** Pin GitHub Actions to `isotope-code` commit `fd39fad1384333ad774f19f35b754659a34dae60`.

**Why:** Bundle patch contracts and regression evidence apply to a specific compiled asset set.

**Consequences:**
- Updating the web UI source requires intentionally changing the pinned SHA and rerunning patch-contract tests.

---

## DEC-012 — `/__auth/check` must be neutral and non-destructive

**Date:** 2026-06-29
**Context:** The Android bridge previously implemented email checking by attempting Supabase signup with a dummy password.

**Chosen:** Return a neutral response from `/__auth/check` and let real signup return the authoritative result.

**Why:** Availability probing must not create users, send email, consume auth rate limits, or reveal arbitrary account existence.

**Consequences:**
- The UI cannot rely on pre-checks to determine whether an arbitrary email exists.
- Regression test verifies zero signup requests.

---

## DEC-013 — Android bootstrap must match server bootstrap contract

**Date:** 2026-06-29
**Context:** `restore-and-launch.js` applies bootstrap snapshots using `snapshot.onboarding.completed`, `profile_data`, `cloud_snapshot`, `study_sessions_log`, and `stats_summary`. Returning only `onboarding_completed` caused incorrect boot routing.

**Chosen:** Android `/__auth/bootstrap` returns the canonical server-compatible response and `restore-and-launch.js` remains backwards-compatible with legacy `onboarding_completed`.

**Why:** Login, restore, and boot routing need one authoritative state machine across server and Android.

**Consequences:**
- Unknown onboarding state remains unknown on network failure; it is not defaulted to false.
- New seeded `completed=false` rows route to onboarding.
- Completed rows route to dashboard.
- Legacy meaningful profile/study data without a valid onboarding row is migrated safely.
