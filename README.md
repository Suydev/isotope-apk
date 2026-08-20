# isotope-apk

Native Android wrapper for **IsotopeAI** — an AI-powered study planner, focus
timer, and analytics app for students preparing for JEE, NEET, CUET, boards,
and other competitive exams.

This repo does **not** contain the app's UI or business logic. It packages
the pre-compiled web app (committed in `www/`) into a
[Capacitor](https://capacitorjs.com/) Android shell, adds a thin native
bridge for auth/session/storage, and ships it as an installable APK.

> **Source of truth:** all UI, routes, features, and styling live in the
> pre-compiled `www/` output committed to this repo. This repo must never
> re-implement or diverge from that UI — it only wraps it for native
> distribution. See [Architecture](#architecture) for exactly how the pieces
> fit together.

---

## What this app does (for users)

IsotopeAI helps students:
- Plan study sessions with an AI-assisted planner
- Run a focus/Pomodoro timer (with an Android floating/PiP overlay)
- Track progress and streaks with analytics and a leaderboard
- Join study groups and communities, with invite links and join codes
- Get notified about session reminders, group activity, and app updates
- Keep working offline, with data syncing back once reconnected

## Architecture

```
isotope-apk (this repo)
  ├─ android-bridge.js               ← native bridge injected as first <head> script
  ├─ android-floating-timer-bridge.js← floating/PiP focus timer overlay bridge
  ├─ scripts/prepare-www.js          ← builds www/ from the web app source,
  │                                    injects bridge, disables PWA-only features,
  │                                    adds boot splash (not run in CI — www/ committed)
  ├─ scripts/apply-android-patches.js← patches minified JS bundles in www/assets/
  │                                    (Android-safe UI tweaks, native modal hooks,
  │                                    Supabase config injection, storage fixes)
  ├─ www/                            ← pre-compiled web app (COMMITTED — source of truth)
  └─ android/                        ← native Capacitor Android project (Gradle)
```

### Build pipeline (also see `.github/workflows/android.yml`)

1. **Checkout** `isotope-apk` (this repo) — `www/` is already committed, so no
   upstream checkout is needed.
2. **`node scripts/apply-android-patches.js`** — applies small, targeted string
   patches to the built JS bundles in `www/assets/` (e.g. routes `window.prompt`
   based "join with code" flows to a native modal, injects Supabase runtime
   config, fixes points/leaderboard NaN edge cases) and to native Android XML
   (permissions, manifest entries).
3. **`npx cap sync android`** — Capacitor copies `www/` into the native project.
4. **`apply-android-patches.js` runs again** — `cap sync` can overwrite some
   native files, so patches are re-applied after sync to guarantee they stick.
5. **Gradle build** — `assembleDebug` (every push) or `bundleRelease` (manual
   dispatch) produces the installable artifact.

`scripts/prepare-www.js` is only used when regenerating `www/` from a fresh web
build. CI builds against the committed `www/`, so the upstream source repo is
never required during a build.

### Why patch instead of fork the UI?

The pre-compiled `www/` output is the single source of truth for the product.
Rather than maintaining a second copy of the UI (which would drift over time),
this repo treats that built output as an opaque, versioned input and applies a
small, auditable set of string-level patches for the handful of things that
must differ on native Android (e.g. `window.prompt()` doesn't render inside a
WebView the way it does in a desktop browser). Every patch is intentionally
narrow and documented in `scripts/apply-android-patches.js`.

### Loading screen fix

The committed `www/index.html` ships `<div id="root"></div>` with no inline
splash markup — in a browser tab this is invisible because the browser's own
loading UI (spinner/progress bar, previous page still visible) covers the gap.
Inside a native Android WebView there is no such chrome, so users would see a
blank/unstyled white screen while the WebView boots, the auth/session bridge
initializes, and the React bundle parses.

`prepare-www.js` injects a small, dependency-free inline splash (pure HTML +
CSS, no external requests) directly after `<head>`, so it paints before any
script — including the auth bridge — executes. It is removed automatically via
a `MutationObserver` on `#root` the moment React paints real content, with a
12-second hard timeout fallback so it can never get stuck on screen. Its
background color (`#0a0a0a`) matches the native Capacitor `SplashScreen`
plugin's background, so the handoff from native splash → HTML splash → app is
visually seamless.

### Notification panel positioning

The notification bell panel in `DashboardHeader` uses `absolute right-0
top-full` positioning — its **right** edge is pinned to the bell button, so the
panel expands **left**, and its width is capped at `calc(100vw - 1.5rem)` so it
can never overflow the viewport. This is intentional upstream behavior and is
left untouched by this repo's patches (a prior Android-only positioning patch
that used `fixed` + safe-area insets was found to be a deviation from source
and has been reverted).

## Repo layout

| Path | Purpose |
|------|---------|
| `android-bridge.js` | Native bridge: session/auth interception, invite URL helpers, native join-code modal hook |
| `android-floating-timer-bridge.js` | Bridge for the Android floating/PiP focus timer overlay |
| `scripts/prepare-www.js` | Builds `www/` from the web app source + injects bridge + boot splash |
| `scripts/apply-android-patches.js` | Patches built JS bundles and native Android config |
| `scripts/agent-status.mjs`, `scripts/agent-resume.sh`, `scripts/agent-handoff.sh` | Agent session bookkeeping (see `.agent/`) |
| `android/` | Native Capacitor Android project (Gradle, Java, manifest, resources) |
| `test/*.test.mjs` | Node test suite covering the bridge and patch logic |
| `.github/workflows/android.yml` | CI: builds debug APK on every push, optional release AAB on manual dispatch |
| `.github/workflows/release.yml` | CI: tags a version and publishes a GitHub Release with the built APK attached |
| `.agent/` | Session handoff docs for AI agents working on this repo (architecture, decisions, known issues, task queue) |
| `capacitor.config.json` | Capacitor app config: `appId=in.isotopeai.app`, native plugin settings |

## Run & operate

```bash
npm ci                       # install dependencies
npm test                     # run the Node test suite (test/*.test.mjs)
npm run build                # prepare-www → apply-patches → cap sync → apply-patches
npm run android:debug        # ./gradlew assembleDebug (needs Android SDK + JDK 17)
npm run android:release      # ./gradlew bundleRelease
```

`npm run build` uses the committed `www/` as-is — no upstream checkout is
required. To regenerate `www/` from a fresh web build, point
`scripts/prepare-www.js` at a local web source via the `REPO_DIR` /
`SOURCE_DIR` env vars:

```bash
REPO_DIR=/path/to/web-source \
SOURCE_DIR=/path/to/web-source/public \
node scripts/prepare-www.js
```

## Stack

- [Capacitor](https://capacitorjs.com/) 6.x (Android)
- Node.js 22, native Gradle/Java 17 build for the Android project
- Plain Node.js build scripts (no bundler) — `prepare-www.js` and
  `apply-android-patches.js` are the entire build pipeline
- `node --test` for the test suite (no external test framework)

## Gotchas

- **Never edit `www/`** — it is the committed pre-compiled UI and is the
  source of truth. To change the UI, regenerate it with `prepare-www.js`
  (plus `apply-android-patches.js`) and commit the result.
- **`apply-android-patches.js` runs twice** in CI — once before `cap sync`
  and once after — because `cap sync` can regenerate native files that need
  patches too. Don't remove the second invocation.
- Always run `npm test` before pushing — the patch scripts patch *minified*
  JS by exact string match, so a small upstream wording/formatting change can
  silently make a patch a no-op. The test suite catches this.

## User preferences

- Push every completed fix to GitHub immediately (don't batch multiple fixes
  into one delayed push).
- Continuously verify parity against the web app source — every page, route,
  asset, and piece of functionality in the Android app should match the
  committed `www/` output exactly, with Android-only differences kept minimal,
  intentional, and documented.

## Pointers

- `.agent/REPLIT_CONTEXT.md` — full session context and rules for AI agents
  working in this repo (evidence classes, Supabase contract, patch-system
  rules, completion gates)
- `.agent/ARCHITECTURE.md`, `.agent/DECISIONS.md`, `.agent/KNOWN_ISSUES.md`,
  `.agent/NEXT_TASKS.md` — deeper session handoff docs
