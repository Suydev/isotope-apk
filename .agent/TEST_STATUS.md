# IsotopeAI Android — Test Status

Tests are only marked PASS when actually executed. Android device and GitHub build results remain UNTESTED until there is APK evidence.

---

| Test / Build | Last Result | Date | Commit | Evidence |
|---|---:|---|---|---|
| Script syntax: `apply-android-patches.js` | PASS | 2026-06-29 | local branch | `node --check scripts/apply-android-patches.js` |
| Script syntax: `prepare-www.js` | PASS | 2026-06-29 | local branch | `node --check scripts/prepare-www.js` |
| Regression tests | PASS | 2026-06-29 | local branch | `npm test`: 9 tests passed |
| `/__auth/check` causes zero signup requests | PASS | 2026-06-29 | local branch | `npm test` |
| Bootstrap completed onboarding canonical shape | PASS | 2026-06-29 | local branch | `npm test` |
| Bootstrap legacy `onboarding_completed=true` fallback | PASS | 2026-06-29 | local branch | `npm test` |
| Bootstrap incomplete onboarding | PASS | 2026-06-29 | local branch | `npm test` |
| Bootstrap nested `profile_data` handling | PASS | 2026-06-29 | local branch | `npm test` |
| Bootstrap network failure does not assume onboarded | PASS | 2026-06-29 | local branch | `npm test` |
| Onboarding completion verified upsert | PASS | 2026-06-29 | local branch | `npm test` |
| RPC failure propagation | PASS | 2026-06-29 | local branch | `npm test` |
| Auth login routes once from bootstrap | PASS | 2026-06-29 | local branch | `npm test` |
| www/ asset preparation | PASS | 2026-06-29 | local branch | `npm run prepare-www`: 154 JS bundles, 56.9 MB |
| Android bundle/native patch application | PASS | 2026-06-29 | local branch | `npm run apply-patches` after sync: 0 skipped, 0 required failures |
| Capacitor sync | PASS | 2026-06-29 | local branch | `npx cap sync android` |
| GitHub Actions debug APK build | UNTESTED | — | — | Must run after branch push |
| Gradle debug APK build | UNTESTED | — | — | GitHub Actions |
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
| Native timer notification | UNTESTED | — | — | Not implemented |
| Backup upload/download safety | UNTESTED | — | — | No emulator/device evidence yet |
| Import/export in packaged APK | UNTESTED | — | — | No emulator/device evidence yet |
| Responsive phone/tablet matrix | UNTESTED | — | — | No emulator/device evidence yet |
| Physical-device testing | UNTESTED | — | — | No Android device attached in this session |

---

## Last Local Test Output

```text
npm test
tests 9
pass 9
fail 0
duration_ms 3416.425615
```

## Next Test to Run

1. Push `codex/android-production-repair`.
2. Confirm GitHub Actions starts for the branch.
3. Download `IsotopeAI-debug-*` artifact.
4. Install APK and capture Logcat/WebView console for login, bootstrap routing, dashboard, onboarding, restore, offline mode, timer, notifications, import/export, and responsive layout matrix.
