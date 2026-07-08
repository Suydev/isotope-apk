# IsotopeAI Android — Next Tasks

---

## Task Queue

### TASK ANDROID-012
**Priority:** P0
**Status:** ACTIVE — CI running on c8e2f0f8, waiting for APK artifact
**Objective:** Runtime-test the current APK on device.

**What's in the current build (c8e2f0f8):**
- pushState guard fix (62/62 tests pass)
- syncFailed CTA → /auth (login path from black screen)
- Group creation error now surfaces to UI
- Supabase community migrations 009+010 applied
- All existing patches (auth hydration, Floating Timer, Analytics fix, etc.)

**To get the APK:**
```bash
# Wait for CI run #85 to complete, then:
curl -s -H "Authorization: Bearer $GITHUB_PAT" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/Suydev/isotope-apk/actions/runs/28925385191/artifacts" \
  | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{const r=JSON.parse(d.join(''));r.artifacts.forEach(a=>console.log(a.id,a.name));});"
```

**Device acceptance checklist:**
- [ ] Login: credentials → loading → dashboard (not back to login)
- [ ] syncFailed screen shows "Sign In" button pointing to /auth
- [ ] Group creation: form submit shows error if membership fails, success if it works
- [ ] Community groups load (no more SupabaseCircuitBreakerError 500)
- [ ] Privacy/settings page scrolls with touch
- [ ] Focus timer: Floating Timer overlay opens and is draggable
- [ ] No black screen on Analytics Monthly switch
- [ ] Invite deep links open in-app (isotopeai:// scheme)

---

### TASK ANDROID-013
**Priority:** P0
**Status:** TODO
**Objective:** Verify Supabase connectivity beyond login on physical device.

**Acceptance:**
- Settings/cloud sync does not falsely say offline
- Manual backup uploads to canonical paths
- Session sync / leaderboard / group analytics work
- Community group creation + join flow works end-to-end (2-account test)

---

### TASK ANDROID-014
**Priority:** P0
**Status:** TODO
**Objective:** Runtime test Floating Timer on OnePlus Pad Go.

**Acceptance:**
- Questions/Practice/Revision opens Floating Timer
- Display-over-other-apps permission works
- Draggable over another app
- Correct/Incorrect/Skip/Undo update store counts
- Timer survives backgrounding and process death

---

### TASK ANDROID-015 — View All Members button
**Priority:** P1
**Status:** TODO
**Objective:** Fix the View All Members button in SingleGroup which is broken on Android.

**What we know:**
- No fix has been written yet
- Issue: button tap likely has no onClick handler or navigates to a route that doesn't exist in the Android context
- Need to find the button in SingleGroup bundle and check its href/onClick

---

### TASK ANDROID-016
**Priority:** P1
**Status:** TODO
**Objective:** Responsive and orientation verification on Android.

---

### TASK ANDROID-017
**Priority:** P2
**Status:** TODO
**Objective:** Plan Capacitor 8 migration to resolve dev dependency audit findings.
