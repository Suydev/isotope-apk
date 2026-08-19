
     Isotope APK Build & Deployment Process — Complete Analysis

     Directory Structure

     /data/data/com.termux/files/home/isotope-apk/
     ├── scripts/                    # Build scripts
     ├── www/                        # Capacitor web assets (output of build)
     ├── android/                    # Android Gradle project
     ├── .github/workflows/          # CI/CD pipelines
     ├── capacitor.config.json       # Capacitor configuration
     ├── package.json                # npm scripts & dependencies
     ├── supabase-config.js          # Config resolution (env → .env → config.json)
     ├── supabase.config.json        # Default Supabase config (committed)
     ├── app-config.json             # App config with version
     ├── .env                        # Local environment variables
     └── start-dev.sh                # Dev server launcher
 1. build-www.js Functionality

     File: /data/data/com.termux/files/home/isotope-apk/scripts/build-www.js (15.5 KB, 335 lines)

     What it handles:

     ┌───────────────────────────────┬────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
     │Step                           │Lines       │Description                                                                            │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Input validation               │30-49       │Validates REPO_DIR, index.html, public/, bridge files exist                            │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Supabase config resolution     │52-66       │Loads from .env (highest priority) → supabase.config.json                              │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Clean www/                     │68-74       │Deletes and recreates www/ directory                                                   │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Copy public/ → www/            │77-79       │Recursive copy of all static assets                                                    │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Copy root index.html           │82-84       │Copies from repo root (not public/)                                                    │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Copy bridge files              │87-91       │Copies android-bridge.js and android-floating-timer-bridge.js                          │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Inject Supabase config         │94-97       │Rewrites constants in android-bridge.js and auth-bridge.js                             │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Patch index.html               │100-169     │Multiple transformations (see below)                                                   │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Generate server snippets       │173-210     │Runs extract-server-scripts.js, injects head/body snippets                             │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Patch hardcoded values         │213-238     │Replaces old project ID (rcnekgzbdlwhcpmpoogz) and anon key in all JS/HTML/CSS/JSON    │
     ├───────────────────────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
     │Verify no hardcoded values     │241-279     │Scans for forbidden patterns (old project IDs, double JWT)                             │
     └───────────────────────────────┴────────────┴───────────────────────────────────────────────────────────────────────────────────────┘

     index.html patches (Step 6):

     - Lines 103-109: Inject android-bridge.js + android-floating-timer-bridge.js as first scripts in <head>
     - Lines 112-118: Disable pwa-local.js (SW registration causes issues in Capacitor)
     - Lines 121-127: Disable update-checker.js (GitHub polling irrelevant in APK)
     - Lines 130-136: Disable deferred-scripts.js (server-injected; covered by android-bridge.js)
     - Lines 139-143: Fix viewport: viewport-fit=cover for Android safe-areas
     - Lines 146-151: Remove hardcoded Supabase globals from index.html
     - Lines 154-166: Inject Supabase config globals inline (__ISO_SUPA_URL__, __ISO_ANON__, __ISO_PROJECT_REF__, __ISO_APP_VERSION__,
       __ISO_IS_ANDROID__)
     - Lines 189-210: Inject server-generated head/body snippets from extract-server-scripts.js

     What's missing / concerns:

     - ⚠️  No minification/bundling — relies on pre-built Vite bundles from isotope-code/public/assets/
     - ⚠️t No asset optimization — no image compression, no tree-shaking, no code splitting optimization
     - ⚠️  No source map handling — source maps from production bundles are copied as-is
     - ⚠️  Hardcoded version — __ISO_APP_VERSION__ = '3.4.6' (line 161) should come from package.json
     - ⚠️t No integrity/hash verification — doesn't verify downloaded assets match expected hashes

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 2. Capacitor Sync Process

     Configuration: /data/data/com.termux/files/home/isotope-apk/capacitor.config.json (37 lines)

     {
       "appId": "in.isotopeai.app",
       "appName": "IsotopeAI",
       "webDir": "www",
       "server": {
         "androidScheme": "https",
         "hostname": "localhost",
         "port": 6767,
         "allowNavigation": ["localhost"]
       },
       "plugins": { ... },
       "android": {
         "allowMixedContent": false,
         "captureInput": true,
         "webContentsDebuggingEnabled": false,
         "appendUserAgent": "IsotopeAI-Android/3.4.6"
       }
     }

     Sync command: npx cap sync android (run in CI and locally)

     What it does:

     1. Copies www/ → android/app/src/main/assets/public/
     2. Updates Capacitor plugins in android/capacitor-cordova-android-plugins/
     3. Generates capacitor.build.gradle with plugin dependencies
     4. Updates AndroidManifest.xml with plugin permissions/activities

     What's missing:

     - ⚠️  No capacitor copy step in build-www.js — must run separately
     - ⚠️t Plugin versions pinned in package.json but no automated update check
     - ⚠️  No verification that sync completed successfully (relies on Gradle build to fail)

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     3. Android Build Steps (Gradle)

     Key files:

     ┌──────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────┐
     │File                                          │Purpose                                                                              │
     ├──────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │/android/build.gradle (29 lines)              │Root buildscript: AGP 8.6.1, Google Services 4.4.0, applies variables.gradle         │
     ├──────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │/android/variables.gradle (16 lines)          │SDK versions: minSdk=24, compileSdk=35, targetSdk=35, dependency versions            │
     ├──────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │/android/settings.gradle (5 lines)            │Includes :app and :capacitor-cordova-android-plugins                                 │
     ├──────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │/android/app/build.gradle (63 lines)          │App config: namespace, applicationId, versionCode=346, versionName=3.4.6, signing,   │
     │                                              │dependencies                                                                         │
     ├──────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │/android/app/capacitor.build.gradle (26 lines)│Generated by Capacitor: Java 17 compatibility, plugin implementations                │
     └──────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────┘

     Build commands (from package.json):

     "android:debug": "cd android && ./gradlew assembleDebug --no-daemon",
     "android:release": "cd android && ./gradlew bundleRelease --no-daemon"

     CI Build (.github/workflows/android.yml):

     - Lines 153-158: ./gradlew assembleDebug --no-daemon --stacktrace with GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx4g"
     - Lines 265-269: ./gradlew bundleRelease --no-daemon for release

     What's missing:

     - ⚠️  No ProGuard/R8 — minifyEnabled false (line 30 in app/build.gradle)
     - ⚠️t Debug keystore used for release — signingConfig signingConfigs.debug for release build (line 29)
     - ⚠️  No ABI splits / APK splits — single universal APK/AAB
     - ⚠️  No Gradle version catalog — versions in variables.gradle only
     - ⚠️t No build cache configuration beyond GitHub Actions cache

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     4. GitHub Actions Workflows

     android-build.yml (62 lines) — Simple Debug Build

     Triggers: push to main, workflow_dispatch
     Flow: Checkout → Node 20 → Java 17 → Android SDK 34/NDK r26c → npm ci → npx cap sync android → ./gradlew assembleDebug → Upload APK

     android.yml (277 lines) — Full CI Pipeline (Primary)

     Triggers: push to main, workflow_dispatch
     Flow: Checkout → Node 20 → Java 17 → Android SDK 34/NDK r26c → npm ci → npx cap sync android → ./gradlew assembleDebug → Upload APK

     android.yml (277 lines) — Full CI Pipeline (Primary)

     Triggers: push to main/codex branches, PR to main, workflow_dispatch (debug/release)
     Env: JAVA_VERSION=17, NODE_VERSION=22, ISOTOPE_CODE_REF=785f9ef... (pinned commit)
     Jobs:

     1. build-debug-apk:
        - Checkout isotope-apk + isotope-code (pinned ref)
        - Setup Node, Java, Android SDK (API 35, Build Tools 35.0.0)
        - npm ci → npm test (regression tests)
        - Prepare www/: runs scripts/prepare-www.js (not build-www.js!)
        - Apply patches: runs scripts/apply-android-patches.js
        - Capacitor sync: npx cap sync android
        - Re-apply patches after sync
        - Build Debug APK → Upload artifact (30 days)
        - Upload build logs on failure
     2. build-release-aab (conditional on workflow_dispatch + release):
        - Same setup, runs prepare-www + patches + sync + patches
        - Build Release AAB → Upload artifact

     release.yml.disabled (233 lines) — Release Automation (Disabled)

     Triggers: push tags v*.*.*, workflow_dispatch
     Features: Version extraction from tag/package.json, changelog parsing, GitHub Release creation, APK upload, auto-tagging

     What's missing:

     - ⚠️  Two different prepare scripts — android.yml uses prepare-www.js, package.json build script uses prepare-www.js, but build-www.js
       exists and is more complete
     - ⚠️  prepare-www.js and apply-android-patches.js are .disabled — CI uses the disabled versions! The active scripts are build-www.js
       only
     - ⚠️x No automated version bump — version hardcoded in multiple places
     - ⚠️  No dependency update automation (Dependabot/Renovate)
     - ⚠️n No signing key management for release builds (uses debug keystore)
     - ⚠️x release.yml is disabled — no automated release pipeline

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     5. Version Management

     Version locations:
 Version locations:

     ┌────────────────────────────────────────────┬───────────────────────────────────────────────────┬───────────────────────────────────┐
     │File                                        │Version                                            │Notes                              │
     ├────────────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────┤
     │package.json                                │"version": "3.4.6"                                 │npm package version                │
     ├────────────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────┤
     │app-config.json                             │"version": "3.4.6"                                 │App config                         │
     ├────────────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────┤
     │android/app/build.gradle                    │versionCode 346, versionName "3.4.6"               │Android version                    │
     ├────────────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────┤
     │capacitor.config.json                       │"appendUserAgent": "IsotopeAI-Android/3.4.6"       │User agent                         │
     ├────────────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────┤
     │build-www.js line 161                       │'3.4.6'                                            │Hardcoded in injected globals      │
     ├────────────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────┤
     │extract-server-scripts.js line 60           │'3.4.6-unknown'                                    │Build stamp                        │
     ├────────────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────┤
     │.github/workflows/android.yml line 20       │ISOTOPE_CODE_REF                                   │Pinned isotope-code commit         │
     └────────────────────────────────────────────┴───────────────────────────────────────────────────┴───────────────────────────────────┘

     What's missing:

     - ⚠️  No single source of truth — version duplicated in 7+ places
     - ⚠️t No automated sync — manual updates required everywhere
     - ⚠️  versionCode = 346 doesn't follow semver (should be 30406 or similar)
     - ⚠️  No git tag ↔ version linkage in CI (release.yml.disabled has it but disabled)
     - ⚠️t isotope-code ref pinned manually — no automated dependency update

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     6. Asset Copying and Optimization

     Asset Pipeline

     isotope-code (source repo)         │
         ├── index.html (repo root)
         ├── public/
         │   ├── assets/           # Vite bundles (hashed filenames)
         │   ├── fonts/
         │   ├── icons/
         │   ├── sounds/
         │   ├── sync/
         │   ├── auth-bridge.js
         │   ├── sw.js
         │   └── ...
         │
         ▼
     scripts/prepare-www.js (or build-www.js)
         │
         ├── Copies public/* → www/
         ├── Copies root index.html → www/index.html
         ├── Copies android-bridge.js → www/
         ├── Injects Supabase config into runtime files
         ├── Patches index.html (inject bridges, disable PWA, fix viewport)
         ├── Runs extract-server-scripts.js → generates isotope-server-head/body.html
         ├── Injects server snippets into index.html
         ├── Patches hardcoded project IDs in all www/ files
         ├── Verifies no hardcoded values remain
         │
         ▼
     www/ (Capacitor webDir)
         │
         ▼
     npx cap sync android
         │
         ▼
     android/app/src/main/assets/public/ (APK assets)
Asset Optimization (what exists):

     ┌─────────────────────────────┬──────┬───────────────────────────────────────────────────────────────────────────────────────────────┐
     │Optimization                 │Status│Location                                                                                       │
     ├─────────────────────────────┼──────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │KaTeX font repair            │✅    │prepare-www.js lines 731-787: copies missing fonts from node_modules/katex/dist/fonts/         │
     ├─────────────────────────────┼──────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Workbox/PWA removal          │✅    │prepare-www.js lines 540-558: replaces SW with minimal, neuters workbox files                  │
     ├─────────────────────────────┼──────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Browser-only artifact pruning│✅    │prepare-www.js lines 789-816: removes 404.html, offline.html, manifest, firebase-messaging-sw. │
     │                             │      │js, pwa-local.js, update-checker.js, screenshots/, workbox-*.js                                │
     ├─────────────────────────────┼──────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Boot splash injection        │✅    │prepare-www.js lines 297-384: injects persistent loading splash + diagnostic overlay           │
     ├─────────────────────────────┼──────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Supabase config injection    │✅    │Both scripts rewrite URLs/keys at build time                                                   │
     ├─────────────────────────────┼──────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Hardcoded value patching     │✅    │build-www.js lines 213-238: replaces old project IDs in all assets                             │
     ├─────────────────────────────┼──────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Asset verification           │✅    │build-www.js lines 241-279: scans for forbidden patterns                                       │
     └─────────────────────────────┴──────┴───────────────────────────────────────────────────────────────────────────────────────────────┘

     Asset Optimization (what's missing):

     ┌────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────┐
     │Missing Optimization                │Impact                                                                                         │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │No image compression                │bg.mp4 (4.3 MB), opengraph.jpg (45 KB), icons not optimized                                    │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │No JS minification beyond Vite      │Bundles already minified but no further optimization                                           │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │No CSS purging/minification         │index-LkPKl--4.css = 442 KB uncompressed                                                       │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │No font subsetting                  │KaTeX fonts: 30+ files, ~2 MB total                                                            │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │No gzip/brotli precompression       │Assets served uncompressed from APK                                                            │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │No bundle analysis                  │No visibility into bundle sizes                                                                │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │No tree-shaking verification        │Large vendor bundles (vendor-sentry: 437 KB, vendor-charts: 416 KB, vendor-react: 199 KB)      │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │No asset hashing verification       │Doesn't verify downloaded production assets match expected hashes                              │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │No dead code elimination            │pull-production-assets.js downloads 144 JS bundles — many may be unused                        │
     └────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     Summary: Critical Gaps

     ┌────────────────────┬───────────┬───────────────────────────────────────────────────────────────────────────────────────────────────┐
     │Area                │Severity   │Description                                                                                        │
     ├────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Script inconsistency│🔴 Critical│CI uses prepare-www.js.disabled + apply-android-patches.js.disabled but active script is build-www.│
     │                    │           │js — different logic!                                                                              │
     ├────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Version management  │🟠 High    │Version duplicated in 7+ places, no single source of truth                                         │
     ├────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Release pipeline    │🟠 High    │release.yml.disabled — no automated releases                                                       │
     ├────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Release signing     │🟠 High    │Debug keystore used for release builds                                                             │
     ├────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Asset optimization  │🟡 Medium  │No image/font optimization, no precompression, large APK size (~20-30 MB+)                         │
     ├────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
     │ProGuard/R8         │🟡 Medium  │Disabled — larger APK, no obfuscation                                                              │
     ├────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Dependency updates  │🟡 Medium  │No automated Capacitor/plugin/dependency updates                                                   │
     ├────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Source maps         │🟢 Low     │Production source maps bundled in APK (security/info leak)                                         │
     ├────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Bundle analysis     │🟢 Low     │No visibility into what's in the 144 JS bundles                                                    │
     └────────────────────┴───────────┴───────────────────────────────────────────────────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     Recommended Fixes (Priority Order)

     1. Unify build scripts — Make build-www.js the single source of truth; remove .disabled scripts or update CI to use build-www.js
     2. Centralize version — Create version.json or use package.json as single source; inject everywhere at build time
     3. Enable release pipeline — Fix release.yml, add proper signing key management (GitHub Secrets → keystore)
     4. Enable ProGuard/R8 — Set minifyEnabled true, add proguard-rules.pro
     5. Add asset optimization — Image compression, font subsetting, gzip precompression
     6. Add bundle analysis — vite-bundle-analyzer or webpack-bundle-analyzer in CI
     7. Automate dependency updates — Add Dependabot/Renovate for Capacitor, Gradle, npm deps
     8. Verify asset integrity — Add hash verification in pull-production-assets.js
