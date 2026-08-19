
     React Routes & Navigation Analysis Report

     1. React Router Setup & Routes

     Router Library: Wouter (not React Router) — a minimal (~1.5KB) router for React
     Location: /data/data/com.termux/files/home/isotope-code/public/assets/App-CQ9mV4wu.js (lines ~1000-1100, the st function)

     Route Definitions (all lazy-loaded via React.lazy):

     ┌──────────────────────────────────────────┬─────────────────────────────────┬───────────────────────────────────────────────────────┐
     │Route                                     │Component                        │Access Guard                                           │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/                                         │Landing (public)                 │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/features/today-dashboard                 │TodayFeature                     │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/features/focus-timer                     │FocusTimerLanding                │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/features/student-task-manager            │TasksFeature                     │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/features/exam-planner                    │ExamPlannerFeature               │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/features/syllabus-tracker                │SyllabusFeature                  │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/features/study-planner                   │StudyFeature                     │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/features/study-analytics                 │AnalyticsFeature                 │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/features/study-groups                    │StudyGroupsFeature               │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/demo                                     │DemoLauncher                     │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/auth                                     │Auth                             │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/reset-password                           │ResetPassword                    │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/onboarding                               │Onboarding                       │AppAccessGate(mode="private")                          │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/dashboard                                │Dashboard                        │AppAccessGate(mode="protected")                        │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/community                                │Community                        │AppAccessGate(mode="protected", onlineOnly)            │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/community/group/:slug                    │Community                        │AppAccessGate(mode="protected", onlineOnly)            │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/invite/:token                            │InviteOnlineOnlyRoute            │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/focus                                    │Focus                            │AppAccessGate(mode="protected")                        │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/analytics                                │Analytics                        │AppAccessGate(mode="protected")                        │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/study                                    │Study                            │AppAccessGate(mode="protected")                        │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/syllabus                                 │Syllabus                         │AppAccessGate(mode="protected")                        │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/syllabus/chapter/:chapterId              │ChapterHub                       │AppAccessGate(mode="protected")                        │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/exams                                    │Exams                            │AppAccessGate(mode="protected")                        │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/exams/:examId                            │ExamDetailPage                   │AppAccessGate(mode="protected")                        │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/tasks                                    │Tasks                            │AppAccessGate(mode="protected")                        │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/settings                                 │SettingsLayout                   │AppAccessGate(mode="protected")                        │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/subscription                             │Subscription                     │AppAccessGate(mode="protected", onlineOnly)            │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/terms                                    │Terms                            │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/privacy                                  │Privacy                          │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │/about                                    │About                            │—                                                      │
     ├──────────────────────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┤
     │* (catch-all)                             │NotFound                         │—                                                      │
     └──────────────────────────────────────────┴─────────────────────────────────┴───────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


     2. /auth/callback Route

     Status: MISSING ❌

     - No /auth/callback route exists in the route table
     - No OAuth callback handling in the Auth component (Auth-D0Y8CB1f.js)
     - The app uses Google One Tap (credential-based) and email/password auth, not traditional OAuth redirect flows
     - Supabase magic links / OAuth would require a callback route — not implemented

     Implication: If Supabase email magic links or OAuth providers (GitHub, Google OAuth) are enabled in Supabase dashboard, users
     clicking email links will hit the NotFound page.

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     3. Navigation Guards / Protected Routes

     Implementation: AppAccessGate component (AppAccessGate-DzNuNpuU.js)

     ┌─────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
     │Mode                 │Behavior                                                                                                      │
     ├─────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │"protected"          │Requires authenticated session + completed onboarding. Redirects unauthenticated → /auth, incomplete          │
     │                     │onboarding → /onboarding                                                                                      │
     ├─────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │"private"            │Requires authenticated session only (used for /onboarding to prevent logged-out access)                       │
     ├─────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │onlineOnly (optional)│Shows offline overlay with CTA to /dashboard when offline (used for /community, /subscription)                │
     └─────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

     Guard Logic (from minified AppAccessGate):

     - Reads auth state from useAuthStore (Zustand + persist middleware)
     - Checks isAuthenticated, userId, planType (scholar/ranker for sync)
     - Triggers background sync via useSyncStore when authenticated
     - Handles offline-first: allows cached access if onlineOnly not set

     Route-Level Protection (also in restore-and-launch.js lines 862-875):

     const PROTECTED_ROUTE_RE = /^\/(dashboard|community|focus|analytics|study|syllabus|exams|tasks|settings|subscription)(\/.*)?$/;

     - On boot, redirects unauthenticated users from protected routes → /auth
     - Redirects authenticated but un-onboarded users from protected routes → /onboarding
     - Redirects authenticated + onboarded users from /onboarding → /dashboard

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     4. Deep Link Handling in React

     In React (App/Custom Hooks):

     - Wouter's useNavigate (z() from vendor-router) used for programmatic navigation
     - Guided Focus System (ve function in App-CQ9mV4wu.js): Stores deep link state in sessionStorage (isotope-guided-focus) with
       destination, focus IDs, type, source, reason, expiry. Restores scroll/focus on navigation.
     - Invite Links: /invite/:token handled by InviteOnlineOnlyRoute → navigates to group join

     In Android Bridge (android-bridge.js lines 343-354):

     // Join-with-code modal → deep link navigation
     if (window.__iso_navigate && typeof window.__iso_navigate === 'function') {
       window.__iso_navigate('/invite/' + encodeURIComponent(code));
     } else if (window.history.pushState) {
       window.history.pushState({}, '', '/invite/' + encodeURIComponent(code));
       window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
     } else {
       window.location.href = '/invite/' + encodeURIComponent(code);
     }

     In restore-and-launch.js (lines 852-875):

     - Preserves deep links unless boot state contradicts target
     - Root / redirects based on auth/onboarding state
     - Protected routes redirect unauthenticated → /auth
     - Onboarding path redirects onboarded users → /dashboard

     Missing: No universal deep link handler for custom URL schemes (isotopeai://) in React — handled only in Android native layer via
     Capacitor App plugin.

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     5. Auth State Listeners


     ┌─────────────────────────────────┬─────────────────────────────────────────────────────────┬────────────────────────────────────────┐
     │Location                         │Mechanism                                                │Purpose                                 │
     ├─────────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────────────┤
     │auth-bridge.js (lines 106-115)   │CustomEvent('isotope:auth-session') + Event('isotope:    │Notifies app of login/signup completion │
     │                                 │auth-unblock') + Event('isotope:sync_refresh')           │                                        │
     ├─────────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────────────┤
     │useAuthStore-Aw1au7RF.js         │Zustand persist middleware onHydrate / onFinishHydration │Rehydrates auth state from localStorage │
     │                                 │callbacks                                                │on app load                             │
     ├─────────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────────────┤
     │android-bridge.js (lines 247-262)│CustomEvent('isotope:network') + native online/offline   │Syncs network state with Capacitor      │
     │                                 │events                                                   │Network plugin                          │
     ├─────────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────────────┤
     │AppAccessGate-DzNuNpuU.js        │useAuthStore selectors (isAuthenticated, userId,         │Reactive guard evaluation on auth/sync  │
     │                                 │planType) + useSyncStore                                 │changes                                 │
     ├─────────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────────────┤
     │restore-and-launch.js (lines 62- │CustomEvent('isotope:boot-state')                        │Publishes boot decision for UI loading  │
     │75)                              │                                                         │states                                  │
     └─────────────────────────────────┴─────────────────────────────────────────────────────────┴────────────────────────────────────────┘

     Missing:

     - No onAuthStateChange listener from Supabase client in React (relies on bridge events + localStorage polling)
     - No centralized auth state machine — logic split across restore-and-launch.js, AppAccessGate, useAuthStore, auth-bridge.js

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     Summary: What's Missing / Gaps

     ┌──────────────────────────┬──────────────────────────────────────────────┬──────────────────────────────────────────────────────────┐
     │Area                      │Gap                                           │Impact                                                    │
     ├──────────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │OAuth Callback            │No /auth/callback route                       │Magic links / OAuth providers broken                      │
     ├──────────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │Deep Link Registration    │No isotopeai:// handler in React              │Custom scheme links only work via Android native          │
     ├──────────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │Auth State Sync           │No Supabase onAuthStateChange subscription    │Relies on localStorage + bridge events; may miss token    │
     │                          │                                              │refresh                                                   │
     ├──────────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │Route-Level Code Splitting│All routes lazy-loaded but no preload strategy│First navigation to protected routes has delay            │
     ├──────────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │Offline Route Access      │onlineOnly only on /community, /subscription  │Other protected routes may fail silently offline          │
     ├──────────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │Auth Error Boundaries     │No ErrorBoundary wrapping routes              │Auth errors can crash entire app                          │
     ├──────────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │Redirect After Login      │Hardcoded to /dashboard in Auth component     │No returnTo / redirectTo support for deep links           │
     └──────────────────────────┴──────────────────────────────────────────────┴──────────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     Key Files Reference

     ┌─────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────┐
     │File                                                         │Purpose                                                               │
     ├─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
     │/isotope-code/public/assets/App-CQ9mV4wu.js                  │Main app component with route definitions (st function)               │
     ├─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
     │/isotope-code/public/assets/AppAccessGate-DzNuNpuU.js        │Navigation guard component (protected/private modes)                  │
     ├─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
     │/isotope-code/public/assets/Auth-D0Y8CB1f.js                 │Auth page (Google One Tap, email/password, signup)                    │
     ├─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
     │/isotope-code/public/restore-and-launch.js                   │Boot-time routing logic, session restore, onboarding check            │
     ├─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
     │/isotope-code/public/auth-bridge.js                          │Auth globals (__isoLogin, __isoUp), session management, events        │
     ├─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
     │/isotope-apk/android-bridge.js                               │Android deep link handling, Capacitor plugins, network bridge         │
     ├─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
     │/isotope-code/public/assets/useAuthStore-Aw1au7RF.js         │Zustand auth store with persist middleware                            │
     ├─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
     │/isotope-code/public/assets/vendor-router-C2sFoTjv.js        │Wouter router (minified)                                              │
     └─────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────────────┘

