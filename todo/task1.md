
     Deep Link Handler Analysis Report

     Summary of Findings

     1. isotopeai://auth/callback Handlers

     ┌───────────────────┬──────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────┐
     │File               │Line(s)   │What Handles What                                                                                    │
     ├───────────────────┼──────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │AndroidManifest.xml│64-69     │Intent Filter — declares isotopeai:// custom scheme with autoVerify="false" (default). Catches ALL   │
     │                   │          │isotopeai:// URLs.                                                                                   │
     ├───────────────────┼──────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │MainActivity.java  │155-176   │resolveDeepLinkRoute() — Handles isotopeai://invite/<code> but does NOT handle isotopeai://auth/     │
     │                   │          │callback. Returns null for auth/callback.                                                            │
     ├───────────────────┼──────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │index.html         │59, 68    │Config — Sets window.__ISO_OAUTH_REDIRECT__ = 'isotopeai://auth/callback' for Supabase OAuth.        │
     ├───────────────────┼──────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │useAuthStore       │~line 1164│signInWithGoogle() — Calls `R.signInWithOAuth("google", { redirectTo: window.ISO_OAUTH_REDIRECT      │
     ├───────────────────┼──────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │vendor-supabase    │~line 1044│Intercepts supabase.co/auth/v1/callback in fetch but NOT isotopeai://auth/callback                   │
     └───────────────────┴──────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────┘

     ❌ MISSING: No handler in MainActivity.java or React router for isotopeai://auth/callback. The Intent filter catches it, but
     resolveDeepLinkRoute() returns null, so the WebView stays on current page. The OAuth flow will fail silently on Android.

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     2. http://localhost:6767/callback Handlers

     ┌─────────────────────┬───────┬──────────────────────────────────────────────────────────────────────────────────────────────────────┐
     │File                 │Line(s)│What Handles What                                                                                     │
     ├─────────────────────┼───────┼──────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │AndroidManifest.xml  │71-76  │Intent Filter — android:scheme="http" android:host="localhost" android:port="6767" android:           │
     │                     │       │pathPrefix="/callback"                                                                                │
     ├─────────────────────┼───────┼──────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │MainActivity.java    │155-192│resolveDeepLinkRoute() — Does NOT handle http://localhost:6767/callback (only https://isotopeai.in    │
     │                     │       │and isotopeai://)                                                                                     │
     ├─────────────────────┼───────┼──────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │capacitor.config.json│5-8    │Server config — Uses https scheme, no local server on port 6767                                       │
     └─────────────────────┴───────┴──────────────────────────────────────────────────────────────────────────────────────────────────────┘

     ❌ MISSING: No handler in MainActivity.java for localhost:6767. This intent filter exists but routes to nowhere — the URI won't match
     any resolveDeepLinkRoute() case.

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 3. Intent Filters in AndroidManifest.xml

     ┌────────────────────────┬──────────┬──────────────────────────────────────┬───────────────┬─────────────────────────────────────────┐
     │Filter                  │Lines     │Scheme/Host/Port/Path                 │autoVerify     │Handles                                  │
     ├────────────────────────┼──────────┼──────────────────────────────────────┼───────────────┼─────────────────────────────────────────┤
     │MAIN/LAUNCHER           │39-42     │—                                     │—              │App launch                               │
     ├────────────────────────┼──────────┼──────────────────────────────────────┼───────────────┼─────────────────────────────────────────┤
     │HTTPS invite            │45-50     │https://isotopeai.in/invite/*         │true           │App Links (verified)                     │
     ├────────────────────────┼──────────┼──────────────────────────────────────┼───────────────┼─────────────────────────────────────────┤
     │HTTPS invite (www)      │51-56     │https://www.isotopeai.in/invite/*     │true           │App Links (verified)                     │
     ├────────────────────────┼──────────┼──────────────────────────────────────┼───────────────┼─────────────────────────────────────────┤
     │HTTPS community         │57-62     │https://isotopeai.in/community/*      │true           │App Links (verified)                     │
     ├────────────────────────┼──────────┼──────────────────────────────────────┼───────────────┼─────────────────────────────────────────┤
     │Custom scheme           │64-69     │isotopeai:// (all paths)              │false          │Catches auth/callback but no handler     │
     ├────────────────────────┼──────────┼──────────────────────────────────────┼───────────────┼─────────────────────────────────────────┤
     │Localhost OAuth         │71-76     │http://localhost:6767/callback        │false          │Catches but no handler                   │
     └────────────────────────┴──────────┴──────────────────────────────────────┴───────────────┴─────────────────────────────────────────┘

     ⚠️  ISSUES:

     - isotopeai:// filter (line 64-69) is too broad — catches all paths but only invite/* is handled
     - http://localhost:6767/callback filter exists but no code handles it
     - Missing android:pathPrefix="/auth/callback" on custom scheme filter
 4. MainActivity.java Deep Link Handling

     ┌──────────────────────┬───────┬─────────────────────────────────────────────────────────────────────────────────────────────────────┐
     │Method                │Lines  │Handles                                                                                              │
     ├──────────────────────┼───────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │onCreate()            │43-49  │Cold-start deep link via handleDeepLinkIntent(getIntent(), false)                                    │
     ├──────────────────────┼───────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │onNewIntent()         │112-118│Warm-start deep link via handleDeepLinkIntent(intent, true)                                          │
     ├──────────────────────┼───────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │handleDeepLinkIntent()│131-149│Parses intent, calls resolveDeepLinkRoute(), navigates WebView                                       │
     ├──────────────────────┼───────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │resolveDeepLinkRoute()│155-192│Only handles:<br>• isotopeai://invite/<code> (host=invite)<br>• isotopeai:///invite/<code> (fallback)│
     │                      │       │<br>• https://isotopeai.in/invite/<code><br>• https://isotopeai.in/community/*<br>Does NOT handle:   │
     │                      │       │isotopeai://auth/callback, http://localhost:6767/callback                                            │
     ├──────────────────────┼───────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │navigateWebViewTo()   │198-216│Uses window.__iso_navigate() or history.pushState()                                                  │
     └──────────────────────┴───────┴─────────────────────────────────────────────────────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     What's Missing / Broken

     ┌─┬──────────────────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────┐
     │#│Issue                                                                     │Impact                                                 │
     ├─┼──────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
     │1│No isotopeai://auth/callback handler in resolveDeepLinkRoute()            │Google OAuth on Android fails — user lands on blank/   │
     │ │                                                                          │unchanged page after consent                           │
     ├─┼──────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
     │2│No http://localhost:6767/callback handler                                 │Capacitor local server OAuth fallback doesn't work     │
     ├─┼──────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
     │3│isotopeai:// intent filter too broad (no pathPrefix)                      │Catches all isotopeai:// URLs but only handles invite/*│
     ├─┼──────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
     │4│No React route for /auth/callback (or equivalent)                         │Even if native passed it to WebView, no React          │
     │ │                                                                          │component handles the OAuth code exchange              │
     ├─┼──────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
     │5│Supabase signInWithOAuth uses redirectTo: window.__ISO_OAUTH_REDIRECT__   │OAuth provider (Google) will reject the redirect       │
     │ │but the redirect URI isn't registered in Supabase dashboard for isotopeai:│                                                       │
     │ │//auth/callback                                                           │                                                       │
     └─┴──────────────────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────┘

     ────────────────────────────────────────────────────────────────────

     Recommended Fixes

     Fix 1: Add auth/callback handling in MainActivity.java

     // In resolveDeepLinkRoute(), add after line 175:
     if ("isotopeai".equalsIgnoreCase(scheme)) {
         if ("auth".equalsIgnoreCase(host) && "/callback".equals(path)) {
             return "/auth/callback";  // Let React handle the code exchange
         }
         // ... existing invite handling
     }

     Fix 2: Add localhost callback handling

     // In resolveDeepLinkRoute(), add after HTTPS block:
     if ("http".equalsIgnoreCase(scheme) &&
         "localhost".equalsIgnoreCase(host) &&
         uri.getPort() == 6767 &&
         path.startsWith("/callback")) {
         return "/auth/callback";
     }

     Fix 3: Tighten intent filters in AndroidManifest.xml

     <!-- Custom URI scheme: ONLY auth/callback and invite/* -->
     <intent-filter>
         <action android:name="android.intent.action.VIEW" />
         <category android:name="android.intent.category.DEFAULT" />
         <category android:name="android.intent.category.BROWSABLE" />
         <data android:scheme="isotopeai" android:host="auth" android:path="/callback" />
     </intent-filter>
     <intent-filter>
         <action android:name="android.intent.action.VIEW" />
         <category android:name="android.intent.category.DEFAULT" />
         <category android:name="android.intent.category.BROWSABLE" />
         <data android:scheme="isotopeai" android:host="invite" />
     </intent-filter>

     Fix 4: Ensure React has /auth/callback route

     The React router (in App-CQ9mV4wu.js or similar) needs a route that:

     - Reads code from URL query params
     - Calls supabase.auth.exchangeCodeForSession(code)
     - Redirects to /dashboard on success

     Fix 5: Register isotopeai://auth/callback in Supabase Dashboard

     - Go to Supabase → Authentication → URL Configuration
     - Add isotopeai://auth/callback to Redirect URLs
     - Add http://localhost:6767/callback for local development
 Files to Modify

     ┌───────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────────┐
     │File                                                                   │Changes Needed                                              │
     ├───────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────┤
     │/data/data/com.termux/files/home/isotope-apk/android/app/src/main/java/│Add auth/callback and localhost:6767/callback cases in      │
     │in/isotopeai/app/MainActivity.java                                     │resolveDeepLinkRoute()                                      │
     ├───────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────┤
     │/data/data/com.termux/files/home/isotope-apk/android/app/src/main/     │Split isotopeai:// filter into two: one for auth/callback,  │
     │AndroidManifest.xml                                                    │one for invite/*                                            │
     ├───────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────┤
     │React router source (in isotope-code repo)                             │Add /auth/callback route with Supabase code exchange logic  │
     ├───────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────┤
     │Supabase Dashboard                                                     │Register both redirect URIs                                 │
     └───────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────────┘

