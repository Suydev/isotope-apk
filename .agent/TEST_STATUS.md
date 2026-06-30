# IsotopeAI Android — Test Status

Tests are only marked PASS when actually executed. Android device and GitHub build results remain UNTESTED until there is APK evidence.

---

| Test / Build | Last Result | Date | Commit | Evidence |
|---|---:|---|---|---|
| Script syntax: `android-bridge.js` | PASS | 2026-06-30 | local branch | `node --check android-bridge.js` |
| Script syntax: `apply-android-patches.js` | PASS | 2026-06-30 | local branch | `node --check scripts/apply-android-patches.js` |
| Script syntax: `prepare-www.js` | PASS | 2026-06-30 | local branch | `node --check scripts/prepare-www.js` |
| Regression tests | PASS | 2026-06-30 | local branch | `npm test`: 11 tests passed |
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
| Android PWA manager disabled and native notification scheduling hooks patched | PASS | 2026-06-30 | local branch | `npm test` |
| Android bridge does not skip native notification setup when `window.Notification` exists | PASS | 2026-06-30 | local branch | `npm test` |
| www/ asset preparation | PASS | 2026-06-30 | local branch | `npm run prepare-www`: 154 JS bundles, 56.9 MB |
| Android bundle/native patch application | PASS | 2026-06-30 | local branch | `npm run build`: first pass patched 15 targets, final pass idempotent, 0 skipped, 0 required failures |
| Capacitor sync | PASS | 2026-06-30 | local branch | `npx cap sync android` |
| Supabase project/auth-log inspection | PASS | 2026-06-30 | local branch | Management API: project active; Auth `/token` login returned HTTP 200 in recent logs |
| GitHub Actions debug APK build | PASS | 2026-06-29 | `d33d38cf976528fe827f69dee21c6d3061ef0c85` | Run `28374915430`: https://github.com/Suydev/isotope-apk/actions/runs/28374915430 |
| Gradle debug APK build | PASS | 2026-06-29 | `d33d38cf976528fe827f69dee21c6d3061ef0c85` | Artifact `IsotopeAI-debug-28`, id `7953037831`, 44,653,663-byte zip |
| Local Termux Gradle debug APK build | BLOCKED | 2026-06-30 | local branch | Java 17 installed; Gradle fails because Android SDK path is missing (`ANDROID_HOME`/`android/local.properties`) |
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
| Native timer notification | PARTIAL | 2026-06-30 | local branch | Code-level patch/test only; no Android device evidence |
| Backup upload/download safety | UNTESTED | — | — | No emulator/device evidence yet |
| Import/export in packaged APK | UNTESTED | — | — | No emulator/device evidence yet |
| Responsive phone/tablet matrix | UNTESTED | — | — | No emulator/device evidence yet |
| Physical-device testing | UNTESTED | — | — | `adb devices -l` shows no attached/authorized device |

---

## Last Local Test Output

```text
npm test
tests 11
pass 11
fail 0
duration_ms 7178.868
```

## Next Test to Run

1. Push the follow-up login/PWA/native-notification patch.
2. Wait for GitHub Actions to produce the new debug artifact.
3. Install that APK on emulator or physical Android device.
4. Capture Logcat/WebView console for login, bootstrap routing, dashboard, onboarding, restore, offline mode, timer, notifications, import/export, and responsive layout matrix.
