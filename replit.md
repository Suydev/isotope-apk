# isotope-apk

Capacitor Android wrapper for **IsotopeAI** — an AI-powered study planner, focus timer, and analytics app for students preparing for JEE, NEET, CUET, boards, and other competitive exams.

## What this repo is

This repo does **not** contain the UI or business logic. It:
- Copies the compiled web app from the upstream web repo into committed `www/`
- Injects Android bridges (`android-bridge.js`, `android-floating-timer-bridge.js`)
- Builds an installable APK via Capacitor + Gradle (on GitHub Actions)

The app cannot run as a web server on Replit. APK builds require Java 17 / Android SDK, which are not available here.

## How to run

```bash
npm install              # install JS deps
npm test                 # run pure-logic tests (no www/ needed for 35/47)
npm run prepare-www      # prepares committed www/ (bridge + Supabase config)
npm run build            # full pipeline: prepare-www + cap sync
```

APK assembly happens on GitHub Actions (`android.yml`). Use `npm run android:debug` locally only if Java 17 + Android SDK are available.

## Stack

- Capacitor 6.x (Android WebView wrapper)
- Node.js 20 build scripts (no bundler) — Replit is configured with `nodejs-20`; the README mentions Node 22 as the CI target but local dev runs on Node 20
- `node --test` for tests (no external framework)
- Supabase for auth, data, storage, realtime
- GitHub Actions for APK CI/CD

## Key files

| File | Purpose |
|------|---------|
| `android-bridge.js` | Intercepts `window.fetch` for `/__auth/*` and `/__supa/*` → direct Supabase calls |
| `android-floating-timer-bridge.js` | Native floating/PiP focus timer overlay bridge |
| `scripts/prepare-www.js` | Copies the web app `public/` → `www/`, injects bridges, disables PWA-only features |
| `www/` | **Build output — never edit by hand** (git-ignored) |
| `android/` | Native Capacitor Android project (Gradle) |
| `.agent/` | Persistent agent context: architecture, decisions, known issues, next tasks |

## Agent context

Always read before working:
1. `.agent/REPLIT_CONTEXT.md` — full session context, rules, evidence classes
2. `AGENTS.md`
3. `.agent/DECISIONS.md`, `.agent/KNOWN_ISSUES.md`, `.agent/NEXT_TASKS.md`

## Test state (as of 2026-07-05)

- All tests pass locally — `www/` is committed so no upstream checkout is required.
- Source-dependent tests (`prepare-patches`, `floating-timer-native`, `latex-rendering`)
  skip cleanly when the upstream web source is unavailable. Do not treat a skip as a failure.

## Current work

Fixing the community system in controlled batches:
1. Supabase security + RPC migration (in the upstream web app)
2. Upstream web implementation using unified RPCs (in the upstream web app)
3. Remove APK community divergence / compiled-code rewrites (in `isotope-apk`)
4. Two-account integration tests for the full community flow

**Safe deployment order:** database migration → upstream web changes → rebuild assets → push APK fixes → build new APK → integration tests.

## User preferences

- Push every completed fix to GitHub immediately (don't batch multiple fixes into one delayed push).
- Continuously verify parity against the committed `www/` — every page, route, asset, and piece of functionality in the Android app should match the web source exactly, with Android-only differences kept minimal, intentional, and documented.
- Fix community logic in the upstream web app first (it is the source of truth for UI/business logic); `isotope-apk` should only contain Android-native adaptations.
