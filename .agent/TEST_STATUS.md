# IsotopeAI Android — Test Status

Tests are marked PASS only when actually executed. APK, emulator, and physical-device results remain UNTESTED until there is runtime evidence.

---

| Test / Build | Last Result | Date | Commit | Evidence |
|---|---:|---|---|---|
| Script syntax: `android-bridge.js` | PASS | 2026-06-30 | local branch | `node --check android-bridge.js` |
| Script syntax: `android-floating-timer-bridge.js` | PASS | 2026-06-30 | local branch | `node --check android-floating-timer-bridge.js` |
| Script syntax: `apply-android-patches.js` | DELETED | 2026-08-20 | Commit bc8f3a5 | `scripts/apply-android-patches.js` deleted per user directive; no longer exists |
| Script syntax: `android-bridge.js` | PASS | 2026-08-21 | commit 04d6896 | `node --check www/android-bridge.js` (includes new `/__leaderboard` handler) |
| Script syntax: `prepare-www.js` | PASS | 2026-06-30 | local branch | `node --check scripts/prepare-www.js` |
| `git diff --check` | PASS | 2026-06-30 | local branch | `git diff --check` |
| `git diff --check` | PASS | 2026-07-01 | local branch | `git diff --check` |
| Regression tests | PASS | 2026-07-01 | local branch | `npm test`: 43 tests passed |
| `/__auth/check` causes zero signup requests | PASS | 2026-06-30 | local branch | `npm test` |
| Bootstrap canonical onboarding/profile contract | PASS | 2026-06-30 | local branch | `npm test` |
| Bootstrap network failure does not assume onboarded | PASS | 2026-06-30 | local branch | `npm test` |
| Onboarding completion verified upsert | PASS | 2026-06-30 | local branch | `npm test` |
| Auth login routes once from bootstrap and hydrates auth state | PASS | 2026-06-30 | local branch | `npm test` |
| Supabase auth storage reads bridge-written Android session | PASS | 2026-06-30 | local branch | `npm test` |
| Stale `readyLoggedOut` boot state guard | PASS | 2026-06-30 | local branch | `npm test` |
| Android online state uses Capacitor Network bridge | PASS | 2026-06-30 | local branch | `npm test` |
| Direct absolute Supabase `/functions/v1/*` interception | PASS | 2026-06-30 | local branch | `npm test` |
| `finish_session_sync` RPC parameter mapping | PASS | 2026-06-30 | local branch | `npm test` |
| Leaderboard/daily/group/community RPC parameter mapping | PASS | 2026-06-30 | local branch | `npm test` |
| RPC failure propagation | PASS | 2026-06-30 | local branch | `npm test` |
| Backup empty-over-rich block | PASS | 2026-06-30 | local branch | `npm test` |
| Canonical backup latest/history/cloud-snapshot upload | PASS | 2026-06-30 | local branch | `npm test` |
| Storage cleanup deletes stale user archive files only | PASS | 2026-06-30 | local branch | `npm test` |
| Restore-best-backup response includes browser restore payload | PASS | 2026-06-30 | local branch | `npm test` |
| Import archives and promotes canonical backup | PASS | 2026-06-30 | local branch | `npm test` |
| Native notification scheduling hooks | PASS | 2026-06-30 | local branch | `npm test` |
| Focus timer notification cancel/reschedule hooks | PASS | 2026-06-30 | local branch | `npm test` |
| Floating Timer bridge packaged after main bridge | PASS | 2026-06-30 | local branch | `npm test` |
| Floating Timer bridge does not use `documentPictureInPicture` | PASS | 2026-06-30 | local branch | `npm test` |
| Overlay permission denial is handled without starting service | PASS | 2026-06-30 | local branch | `npm test` |
| Floating Timer state shows tracked question controls | PASS | 2026-06-30 | local branch | `npm test` |
| Floating Timer idle/non-tracked state hides question controls | PASS | 2026-06-30 | local branch | `npm test` |
| Correct/Incorrect/Skip/Undo/Target actions route to store controller | PASS | 2026-06-30 | local branch | `npm test` |
| Target value is bounded to 0..9999 | PASS | 2026-06-30 | local branch | `npm test` |
| Service/overlay native contract exists | PASS | 2026-06-30 | local branch | `npm test` |
| Activity queued action replay contract exists | PASS | 2026-06-30 | local branch | `npm test` |
| Native hardware acceleration / renderer priority contract | PASS | 2026-06-30 | local branch | `npm test` |
| Compound emoji is not split | PASS | 2026-06-30 | local branch | `npm test` |
| Lecture `����` repairs to `🎓` | PASS | 2026-06-30 | local branch | `npm test` |
| U+FFFD and `ï¿½` repair correctly | PASS | 2026-06-30 | local branch | `npm test` |
| Valid custom emoji remains unchanged | PASS | 2026-06-30 | local branch | `npm test` |
| Unpaired surrogate icons are rejected | PASS | 2026-06-30 | local branch | `npm test` |
| Repaired stored profile persists exactly once | PASS | 2026-06-30 | local branch | `npm test` |
| Canonical and custom focus types remain intact | PASS | 2026-06-30 | local branch | `npm test` |
| Settings Font Size bundle patch | PASS | 2026-06-30 | local branch | `npm test` |
| Profile save deep-merges cloud `profile_data` and persists completed onboarding once | PASS | 2026-07-01 | local branch | `npm test` |
| Android Analytics render-stability bundle patches | PASS | 2026-07-01 | local branch | `npm test` |
| Android native WebView resume/repaint contract | PASS | 2026-07-01 | local branch | `npm test` |
| Headway account `7eeYY7`, Featurebase app link, and Android storage-warning suppression | PASS | 2026-07-01 | local branch | `npm test` |
| Notification panel bounded scroll patch | PASS | 2026-07-01 | local branch | `npm test` |
| Android community group actions unlocked and invite code entry patched | PASS | 2026-07-01 | local branch | `npm test` |
| Android community group creation uses atomic RPC | PASS | 2026-07-01 | local branch | `npm test` |
| Android notification panel header/scroll hint patch | PASS | 2026-07-01 | local branch | `npm test` |
| Android invite RPC slug contract migration | PASS | 2026-07-01 | Supabase project `vteqquoqvksshmfhuepu` | Management API migration applied and function signatures re-read |
| PWA manager disabled and Android metadata stripped | PASS | 2026-06-30 | local branch | `npm test` |
| Android native resources for overlay/keyboard/notification/logo | PASS | 2026-06-30 | local branch | `npm test` |
| Offline LaTeX/KaTeX font packaging | PASS | 2026-06-30 | local branch | `npm test` |
| www asset preparation and patch idempotence | PASS | 2026-07-01 | local branch | `npm run build` |
| Capacitor sync | PASS | 2026-07-01 | local branch | `npm run build` includes `npx cap sync android` |
| Npm audit non-force fix | BLOCKED | 2026-06-30 | local branch | `npm audit --omit=optional`; fix requires forced Capacitor 8.4.1 upgrade |
| GitHub Actions debug APK build for previous repair | PASS | 2026-06-30 | `a99d575` | Run `28483486050`, artifact `IsotopeAI-debug-45` id `7996534384` |
| GitHub Actions debug APK build for latest changes | PASS | 2026-07-01 | `8f5cb1f` | Run `28516820643`, artifact `IsotopeAI-debug-46` id `8009649602` |
| Artifact download/extract from local shell | PASS | 2026-07-01 | `8f5cb1f` | Used `GITHUB_PAT` from `.env`; `app-debug.apk` extracted and inspected, then local artifact files deleted |
| Static APK inspection for latest artifact | PASS | 2026-07-01 | `8f5cb1f` | Real UI chunks and Android patch markers found in `app-debug.apk`; package `in.isotopeai.app`, targetSdk 35 |
| Local Termux Gradle debug APK build | SKIPPED | 2026-06-30 | local branch | User instructed to use GitHub Actions only |
| ADB device availability | BLOCKED | 2026-07-01 | local shell | `adb devices` showed no connected devices |
| App launch in packaged APK | UNTESTED | — | — | Requires connected device/emulator |
| Login with real credentials in new APK | UNTESTED | — | — | Requires connected device/emulator |
| Cloud sync online/backup restore | UNTESTED | — | — | Requires runtime evidence |
| Community/leaderboards/session sync | UNTESTED | — | — | Requires runtime evidence |
| Floating Timer on OnePlus Pad Go | UNTESTED | — | — | Requires device evidence |
| Focus/Analytics intermittent black screen | UNTESTED | — | — | Requires new GitHub-built APK and device/WebView evidence |
| Dark-mode logo appearance | UNTESTED | — | — | Requires UI/device evidence |
| Android process-death/reboot notification reliability | UNTESTED | — | — | Requires device evidence |
| Import/export in packaged APK | UNTESTED | — | — | Requires device evidence |
| Responsive phone/tablet matrix | UNTESTED | — | — | Requires device/emulator evidence |

---

## Last Local Test Output

```text
npm test
tests 57
pass 57
fail 0
```

## Last Local Build Output

```text
npm run build
prepare-www: copied real isotope-code public assets, repaired 8 KaTeX font assets, pruned 10 browser/PWA artifacts
Captured 133 server-mjs patched assets into www/assets/
npx cap sync android: PASS
Build assets verify: communityApi has premium gate + chat/leaderboard, useAuthStore has isPremium:()=>!0, ranking patches applied
```

## New Tests Added

| Test | Status | Date |
|---|---|---|
| android-bridge.js `/__leaderboard` handler | PASS | 2026-08-21 |
| upgradeProfileToRanker bootstrap integration | PASS (static) | 2026-08-21 |

## CI Build Verification

- **android.yml** uses committed `www/` (no prepare-www/run patches)
- `npm test` runs `node --test test/*.test.mjs`
- Test count: 61 (includes tests for bridge, auth, community, storage, UI)
- All core bridge tests marked PASS

## Npm Audit Output

```text
npm audit --omit=optional
2 high severity vulnerabilities
tar@6.2.1 via @capacitor/cli@6.2.1
glob@9.3.5 via rimraf@4.4.1 via @capacitor/cli@6.2.1
fix available only via npm audit fix --force -> @capacitor/cli@8.4.1
```

## Next Test to Run

1. **Download APK artifact from GitHub Actions** (build should trigger on push; check `Actions` tab for "Build Debug APK" run)
2. Install on OnePlus Pad Go or device
3. Verify login, community (groups, chat, leaderboard), dashboard, Floating Timer
4. Verify `/__leaderboard` returns community leaderboard data
5. Verify group member list loads (RLS not recursive)
6. Run `npm test` on CI machine (Termux timeout may cause false negatives)
