 Analysis Report: MainActivity.java Deep Link Handling

     File: /data/data/com.termux/files/home/isotope-apk/android/app/src/main/java/in/isotopeai/app/MainActivity.java

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     1. Deep Link Handling in onCreate/onNewIntent

     ┌───────────┬───────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
     │Location   │Lines  │Description                                                                                                     │
     ├───────────┼───────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │onCreate   │43-49  │Cold-start deep link handling (app launched from link). Calls handleDeepLinkIntent(getIntent(), false) with     │
     │           │       │immediate=false — defers navigation by 1500ms until bridge is ready.                                            │
     ├───────────┼───────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │onNewIntent│112-118│Warm-start deep link handling (app already running). Calls handleDeepLinkIntent(intent, true) with              │
     │           │       │immediate=true — navigates immediately. Also calls setIntent(intent) to update the stored intent.               │
     └───────────┴───────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     2. resolveDeepLinkRoute() Method

     Lines 155-192 — Private method that converts a deep-link URI into a WebView-internal route string.

     Logic flow:

     1. Extracts scheme, host, path from URI
     2. Custom scheme isotopeai:// (lines 165-176):
        - isotopeai://invite/<code> → host="invite", path="/<code>" → returns /invite/<code>
        - Fallback: isotopeai:///invite/<code> or isotopeai:/invite/<code> → path starts with /invite/ → returns /invite/<code>
     3. HTTPS scheme (lines 179-190):
        - Hosts: isotopeai.in or www.isotopeai.in
        - /invite/<code> → returns /invite/<code> (or /community if code empty)
        - /community... → returns full path (e.g., /community, /community/123)
     4. Returns null for unrecognized URIs

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     3. URI Schemes/Hosts/Paths Handled

     ┌─────────────────────┬───────────────────────────────────────────┬──────────────────────────┬───────────────────────────────────────┐
     │Scheme               │Host                                       │Path Pattern              │Mapped Route                           │
     ├─────────────────────┼───────────────────────────────────────────┼──────────────────────────┼───────────────────────────────────────┤
     │isotopeai            │invite                                     │/<code>                   │/invite/<code>                         │
     ├─────────────────────┼───────────────────────────────────────────┼──────────────────────────┼───────────────────────────────────────┤
     │isotopeai            │(any)                                      │/invite/<code>            │/invite/<code> (fallback)              │
     ├─────────────────────┼───────────────────────────────────────────┼──────────────────────────┼───────────────────────────────────────┤
     │https                │isotopeai.in / www.isotopeai.in            │/invite/<code>            │/invite/<code>                         │
     ├─────────────────────┼───────────────────────────────────────────┼──────────────────────────┼───────────────────────────────────────┤
     │https                │isotopeai.in / www.isotopeai.in            │/community...             │/community... (passthrough)            │
     └─────────────────────┴───────────────────────────────────────────┴──────────────────────────┴───────────────────────────────────────┘


     4. What's Missing for Target URIs

     ┌───────────────────────┬─────────┬──────────────────────────┬─────────┬──────────────┬──────────────────────────────────────────────┐
     │Target URI             │Scheme   │Host                      │Path     │Status        │Missing                                       │
     ├───────────────────────┼─────────┼──────────────────────────┼─────────┼──────────────┼──────────────────────────────────────────────┤
     │isotopeai://auth/      │isotopeai│auth                      │/callback│❌ NOT HANDLED│No handling for host="auth" — only            │
     │callback               │         │                          │         │              │host="invite" is recognized (line 166). Falls │
     │                       │         │                          │         │              │through to return null at line 175.           │
     ├───────────────────────┼─────────┼──────────────────────────┼─────────┼──────────────┼──────────────────────────────────────────────┤
     │http://localhost:6767/ │http     │localhost:6767 (or        │/callback│❌ NOT HANDLED│No http scheme handling at all (lines 179-190 │
     │callback               │         │localhost with port)      │         │              │only check https). No localhost host handling.│
     │                       │         │                          │         │              │ No /callback path pattern.                   │
     └───────────────────────┴─────────┴──────────────────────────┴─────────┴──────────────┴──────────────────────────────────────────────┘

     Summary

     Missing implementations needed:

     1. isotopeai://auth/callback — Add handling for host="auth" with path /callback in the isotopeai scheme block (around line 165-176)
     2. http://localhost:6767/callback — Add http scheme handling (similar to https block) for localhost host with port, and /callback
        path pattern

     Suggested additions to resolveDeepLinkRoute():

     // After line 174 (inside isotopeai scheme block):
     } else if ("auth".equalsIgnoreCase(host) && path.startsWith("/callback")) {
         return "/auth/callback";  // or whatever route the web app expects
     }

     // New block for http scheme (after https block, before line 191):
     if ("http".equalsIgnoreCase(scheme) &&
         host != null &&
         (host.equalsIgnoreCase("localhost") || host.startsWith("localhost:"))) {
         if (path.startsWith("/callback")) {
             return "/auth/callback";
         }
     }

.

