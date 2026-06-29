# IsotopeAI Android — Test Status

Tests are only marked PASS when actually executed against the recorded commit.
Tests marked UNTESTED have not been run yet.

---

| Test / Build | Last Result | Date | Commit | Evidence |
|---|---|---|---|---|
| www/ asset preparation | UNTESTED | — | — | Run: `node scripts/prepare-www.js` |
| Android patch application | UNTESTED | — | — | Run: `node scripts/apply-android-patches.js` |
| Capacitor sync | UNTESTED | — | — | Run: `npx cap sync android` |
| Gradle debug APK build | UNTESTED | — | — | GitHub Actions |
| Gradle release AAB build | UNTESTED | — | — | GitHub Actions |
| Android lint | UNTESTED | — | — | `./gradlew lint` |
| Gradle unit tests | UNTESTED | — | — | `./gradlew test` |
| App launch (fresh install) | UNTESTED | — | — | Manual device test |
| Login with real credentials | UNTESTED | — | — | Manual device test |
| Dashboard data loads | UNTESTED | — | — | Manual device test |
| New-device restore (cloud → local) | UNTESTED | — | — | Manual device test |
| Offline launch (no network) | UNTESTED | — | — | Manual device test |
| Timer start/pause/complete | UNTESTED | — | — | Manual device test |
| Timer survives app background | UNTESTED | — | — | Manual device test |
| Timer notification | UNTESTED | — | — | Manual device test |
| Session synced to Supabase | UNTESTED | — | — | Manual + DB check |
| Backup upload to Supabase Storage | UNTESTED | — | — | Manual device test |
| Backup download (best backup) | UNTESTED | — | — | Manual device test |
| Import JSON backup | UNTESTED | — | — | Manual device test |
| Export JSON backup | UNTESTED | — | — | Manual device test |
| Settings profile update | UNTESTED | — | — | Manual device test |
| Avatar upload | UNTESTED | — | — | Manual device test |
| Community features (online) | UNTESTED | — | — | Manual device test |
| Community offline state | UNTESTED | — | — | Manual device test |
| Analytics charts display | UNTESTED | — | — | Manual device test |
| Tasks CRUD operations | UNTESTED | — | — | Manual device test |
| Exams feature | UNTESTED | — | — | Manual device test |
| Phone portrait screenshot | UNTESTED | — | — | Manual screenshot |
| Phone landscape screenshot | UNTESTED | — | — | Manual screenshot |
| Tablet portrait screenshot | UNTESTED | — | — | Manual screenshot |
| User switching (logout + new login) | UNTESTED | — | — | Manual device test |
| BLOCKED_EMPTY_OVERWRITE (safety) | UNTESTED | — | — | Run: `node scripts/prove-new-browser-restore.mjs` |

---

## Test Commands (when environment is ready)

```bash
# Build verification
node scripts/prepare-www.js
node scripts/apply-android-patches.js
npx cap sync android
cd android && ./gradlew assembleDebug && cd ..

# Install on device
adb install android/app/build/outputs/apk/debug/app-debug.apk

# View logs during testing
adb logcat | grep -E "IsotopeAI|isotope|capacitor|Capacitor"

# Supabase sync proof (requires .env with keys — never commit)
node scripts/prove-supabase-sync.mjs  # run from isotope-code repo

# Runtime glue proof
node scripts/prove-runtime-glue.mjs   # run from isotope-code repo

# New device restore proof
node scripts/prove-new-browser-restore.mjs --user <userId>
```

---

## Next Test to Run

1. Push to GitHub → GitHub Actions triggers
2. Download `IsotopeAI-debug-N.apk` artifact from Actions tab
3. `adb install app-debug.apk`
4. Launch → verify not white screen
5. Log in → verify dashboard loads
