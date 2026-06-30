# IsotopeAI Android — Test Status

Tests are only marked PASS when actually executed. Android device and GitHub build results remain UNTESTED until there is APK evidence.

---

| Test / Build | Last Result | Date | Commit | Evidence |
|---|---:|---|---|---|
| Script syntax: `android-bridge.js` | PASS | 2026-06-30 | local branch | `node --check android-bridge.js` |
| Script syntax: `apply-android-patches.js` | PASS | 2026-06-30 | local branch | `node --check scripts/apply-android-patches.js` |
| Script syntax: `prepare-www.js` | PASS | 2026-06-30 | local branch | `node --check scripts/prepare-www.js` |
| Regression tests | PASS | 2026-06-30 | local branch | `npm test`: 18 tests passed |
| `/__auth/check` causes zero signup requests | PASS | 2026-06-30 | local branch | `npm test` |
| Bootstrap completed onboarding canonical shape | PASS | 2026-06-30 | local branch | `npm test` |
| Bootstrap legacy `onboarding_completed=true` fallback | PASS | 2026-06-30 | local branch | `npm test` |
| Bootstrap incomplete onboarding | PASS | 2026-06-30 | local branch | `npm test` |
| Bootstrap nested `profile_data` handling | PASS | 2026-06-30 | local branch | `npm test` |
| Bootstrap network failure does not assume onboarded | PASS | 2026-06-30 | local branch | `npm test` |
| Onboarding completion verified upsert | PASS | 2026-06-30 | local branch | `npm test` |
| RPC failure propagation | PASS | 2026-06-30 | local branch | `npm test` |
| Auth login routes once from bootstrap and hydrates auth state | PASS | 2026-06-30 | local branch | `npm test` |
| Supabase auth storage reads bridge-written Android session | PASS | 2026-06-30 | local branch | `npm test` |
| Stale `readyLoggedOut` boot state does not override authenticated Android login | PASS | 2026-06-30 | local branch | `npm test` |
| AppAccessGate preserves Android auth keys during storage cleanup | PASS | 2026-06-30 | local branch | `npm test` |
| Android PWA manager disabled and native notification scheduling hooks patched | PASS | 2026-06-30 | local branch | `npm test` |
| Android bridge does not skip native notification setup when `window.Notification` exists | PASS | 2026-06-30 | local branch | `npm test` |
| Android online state uses Capacitor Network bridge | PASS | 2026-06-30 | local branch | `npm test`: bridge and patch-contract coverage |
| Native notification scheduling uses `ic_notification` and `allowWhileIdle` | PASS | 2026-06-30 | local branch | `npm test` |
| Focus timer cancels previous native completion notification before rescheduling | PASS | 2026-06-30 | local branch | `npm test` |
| Focus PiP delegates to Android JavaScript interface | PASS | 2026-06-30 | local branch | `npm test` |
| Settings Font Size bundle patch | PASS | 2026-06-30 | local branch | `npm test` |
| Android native resources for PiP/keyboard/notification/logo | PASS | 2026-06-30 | local branch | `npm test` |
| www/ asset preparation | PASS | 2026-06-30 | local branch | `npm run prepare-www`: 154 JS bundles, 56.9 MB |
| Android bundle/native patch application | PASS | 2026-06-30 | local branch | `npm run build`: first pass patched 23 targets, final pass idempotent, 0 skipped, 0 required failures |
| Generated Android assets contain login boot-state refresh | PASS | 2026-06-30 | local branch | `rg` confirmed `window.__ISO_BOOT_STATE__`, `readyDashboard`, `readyNeedsOnboarding`, and `Y === "readyLoggedOut" && !u` in `www/` and `android/app/src/main/assets/public` |
| Capacitor sync | PASS | 2026-06-30 | local branch | `npx cap sync android` |
| Agent status active-task parser | PASS | 2026-06-30 | local branch | `node --check scripts/agent-status.mjs`; `npm run agent:status` now reports `ANDROID-006` |
| Supabase project/auth-log inspection | PASS | 2026-06-30 | local branch | Management API: project active; Auth `/token` login returned HTTP 200 in recent logs |
| GitHub Actions debug APK build | PASS | 2026-06-30 | `ce73a3f` | Push run `28415768373` and PR run `28415767170` succeeded |
| GitHub debug APK artifact | PASS | 2026-06-30 | `ce73a3f` | Artifact `IsotopeAI-debug-35`, id `7969405842`, 44,659,790-byte zip |
| Downloaded APK static inspection | PASS | 2026-06-30 | `ce73a3f` | `/data/data/com.termux/files/usr/tmp/isotope-apk-ce73a3f/artifact/app-debug.apk`, 54 MB, 154 JS chunks, 266 public files |
| APK auth storage fallback present | PASS | 2026-06-30 | `ce73a3f` | Extracted `assets/App-pJGjDiPw.js` contains Android `localStorage` fallback for `isotope-auth-token`, `sb-vteqquoqvksshmfhuepu-auth-token`, and `isotope-last-session-raw` |
| APK native notification bridge present | PASS | 2026-06-30 | `ce73a3f` | Extracted `android-bridge.js` contains native replacement path and `__isoEnsureNotificationPermission` / `__isoScheduleNativeNotification` / `__isoScheduleFocusTimer` |
| APK native permissions | PASS | 2026-06-30 | `ce73a3f` | `aapt dump permissions app-debug.apk` confirms notification, boot, wake lock, foreground service, exact alarm, network permissions |
| Current GitHub Actions debug APK build | PENDING | 2026-06-30 | local branch | Must push current Android-native wiring commit; use GitHub Actions only for APK assembly |
| Local Termux Gradle debug APK build | SKIPPED | 2026-06-30 | local branch | User instructed to use GitHub Actions only. Earlier local attempt also showed no Android SDK path. |
| Gradle release AAB build | UNTESTED | — | — | GitHub Actions workflow_dispatch release |
| Android lint | UNTESTED | — | — | Not run |
| Gradle unit tests | UNTESTED | — | — | Not run |
| App launch in packaged APK | UNTESTED | — | — | No emulator/device evidence yet |
| Login with real credentials in packaged APK | UNTESTED | — | — | No emulator/device evidence yet |
| Existing account dashboard route | UNTESTED | — | — | No emulator/device evidence yet |
| New account onboarding route | UNTESTED | — | — | No emulator/device evidence yet |
| New-device restore cloud to local | UNTESTED | — | — | No emulator/device evidence yet |
| Offline launch and local-only mode | UNTESTED | — | — | No emulator/device evidence yet |
| Timer background/process-death behavior | UNTESTED | — | — | No emulator/device evidence yet |
| Native timer notification | PARTIAL | 2026-06-30 | local branch | Code-level patch/test/resource contract only; no Android device evidence |
| Backup upload/download safety | UNTESTED | — | — | No emulator/device evidence yet |
| Import/export in packaged APK | UNTESTED | — | — | No emulator/device evidence yet |
| Responsive phone/tablet matrix | UNTESTED | — | — | No emulator/device evidence yet |
| Physical-device testing | UNTESTED | — | — | `adb devices -l` shows no attached/authorized device |

---

## Last Local Test Output

```text
npm test
tests 18
pass 18
fail 0
duration_ms 8132.196
```

## Next Test to Run

1. Push the Android-native wiring commit and wait for the next GitHub Actions debug APK.
2. Download and statically inspect the artifact.
3. Make an Android device visible to ADB.
4. Install the new APK, then capture Logcat/WebView console for login, cloud sync/online status, bootstrap routing, dashboard, onboarding, restore, offline mode, timer, notifications, Focus PiP, import/export, keyboard/back behavior, and responsive layout matrix.
