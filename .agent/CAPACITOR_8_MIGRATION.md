# Capacitor 8 Migration Plan

**Created:** 2026-08-14 (session 5)
**Current:** Capacitor 6.2.1
**Target:** Capacitor 8.5.0
**Reason:** Fix 3 npm audit vulnerabilities (2 high, 1 critical) in `@capacitor/cli@6.2.1` → `tar@6.2.1`

---

## Scope

This is an **Android-only** project. No iOS changes needed.

---

## Breaking Changes Summary (6 → 7 → 8)

### From Capacitor 6 → 7
- `coreSplashScreenVersion` updated to `1.2.0`
- `android.adjustMarginsForEdgeToEdge` removed (not used — no action needed)
- Various plugin version bumps

### From Capacitor 7 → 8
- Android SDK 36 targeting recommended
- `appendUserAgent` whitespace fix on iOS (not relevant)
- `capacitor-android` package namespace changes
- Plugin API changes for LocalNotifications, SplashScreen

---

## Migration Steps

### Phase 1: Preparation (do first)
1. Create a migration branch: `git checkout -b feat/capacitor-8-migration`
2. Ensure all current tests pass: `npm test`
3. Ensure current CI is green
4. Back up `android/` directory (git already tracks it)

### Phase 2: Update Dependencies
```bash
# Update CLI first
npm i -D @capacitor/cli@latest

# Update core
npm i @capacitor/core@latest @capacitor/android@latest

# Update plugins
npm i @capacitor/app@latest @capacitor/filesystem@latest \
      @capacitor/local-notifications@latest @capacitor/network@latest \
      @capacitor/preferences@latest @capacitor/share@latest \
      @capacitor/splash-screen@latest @capacitor/status-bar@latest
```

### Phase 3: Run Migration CLI
```bash
npx cap migrate
```

This should auto-update:
- `android/variables.gradle` (SDK versions, dependency versions)
- `android/app/build.gradle` if needed
- `android/build.gradle` if needed
- `capacitor.config.ts` if needed

### Phase 4: Manual Adjustments
1. **variables.gradle** — verify/update:
   - `compileSdkVersion = 36` (or 35 if 36 causes issues)
   - `targetSdkVersion = 36`
   - `coreSplashScreenVersion = '1.2.0'`
   - All AndroidX versions updated

2. **capacitor.config.ts** — verify:
   - `android.adjustMarginsForEdgeToEdge` removed (not present — OK)
   - Any new required fields

3. **android-bridge.js** — verify:
   - Capacitor import paths unchanged
   - LocalNotifications API unchanged
   - Network API unchanged

### Phase 5: Build & Test
```bash
# Clean build
rm -rf android/app/build
rm -rf node_modules
npm install

# Prepare and patch
npm run prepare-www
npm run apply-patches

# Sync Capacitor
npx cap sync android

# Re-apply patches (after cap sync overwrites www/)
npm run apply-patches

# Run tests
npm test

# Build debug APK
cd android && ./gradlew assembleDebug
```

### Phase 6: CI Update
1. Update `.github/workflows/android.yml`:
   - `NODE_VERSION: '22'` (already correct)
   - Verify Gradle wrapper version compatibility

2. Update `.github/workflows/release.yml`:
   - Same Node/Gradle checks

3. Push and verify CI passes

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Plugin API breaking changes | HIGH | Check Capacitor changelogs for each plugin |
| Gradle version incompatibility | MEDIUM | `npx cap migrate` handles most cases |
| android-bridge.js Capacitor imports | LOW | Capacitor core API stable across versions |
| Patch script (apply-android-patches.js) | LOW | Patches target compiled JS bundles, not Capacitor APIs |
| SplashScreen API changes | LOW | Current config uses basic options |
| LocalNotifications API changes | MEDIUM | Check for scheduling API changes |

---

## Rollback Plan

If migration fails:
1. `git checkout main` — revert to working state
2. `rm -rf node_modules && npm install` — restore dependencies
3. `npx cap sync android` — restore native project
4. Run tests to confirm rollback

---

## Testing Checklist

- [ ] `npm test` — all 63 tests pass
- [ ] `npm audit` — 0 vulnerabilities
- [ ] Debug APK builds successfully
- [ ] Release APK builds successfully
- [ ] CI workflows pass (Build Android APK + Release)
- [ ] Device: Login works
- [ ] Device: Floating Timer works
- [ ] Device: Community features work
- [ ] Device: Notifications work
- [ ] Device: No black screen on rotation

---

## Estimated Effort

- **Code changes:** 1-2 hours (mostly dependency updates + config)
- **Testing:** 1-2 hours (build verification + device testing)
- **Total:** 2-4 hours

---

## Notes

- The `apply-android-patches.js` script patches **compiled JS bundles**, not Capacitor native code. It should be unaffected by the Capacitor upgrade unless bundle filenames change.
- The `android-bridge.js` uses Capacitor core APIs (`Capacitor.Plugins.*`) which are stable across versions.
- Current `minSdkVersion = 24` is fine for Capacitor 8 (minimum is 23).
- Current Node.js 22 requirement is already met.
