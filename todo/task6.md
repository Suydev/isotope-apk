
     Authentication System Analysis Report

     Files Analyzed

     ┌───────────────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────┐
     │File                                                                           │Purpose                                             │
     ├───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────┤
     │/data/data/com.termux/files/home/isotope-apk/www/assets/useAuthStore-Aw1au7RF. │Main Zustand auth store (minified bundle)           │
     │js                                                                             │                                                    │
     ├───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────┤
     │/data/data/com.termux/files/home/isotope-apk/www/assets/Auth-D0Y8CB1f.js       │Auth UI component (sign in/up forms, Google One Tap)│
     ├───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────┤
     │/data/data/com.termux/files/home/isotope-apk/www/auth-bridge.js                │Runtime auth bridge (email/password fallback)       │
     ├───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────┤
     │/data/data/com.termux/files/home/isotope-apk/www/android-bridge.js             │Android Capacitor bridge (OAuth callback handler)   │
     ├───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────┤
     │/data/data/com.termux/files/home/isotope-apk/www/assets/vendor-supabase-       │Supabase JS client (OAuth flow, PKCE, redirectTo)   │
     │D_TSSuUW.js                                                                    │                                                    │
     └───────────────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     1. signInWithGoogle Implementation
     File: useAuthStore-Aw1au7RF.js (minified, ~line 1 of exported functions)

     signInWithGoogle: async () => {
       a({isLoading: true, error: null});
       await Ce("pre-sign-in");
       const t = await R.signInWithOAuth("google", {
         redirectTo: window.__ISO_OAUTH_REDIRECT__ || "/auth/callback"
       });
       return t.success || a({isLoading: false, error: t.error}), t;
     }

     File: Auth-D0Y8CB1f.js (Google One Tap - lines in F component)

     - Loads Google Identity Services SDK (https://accounts.google.com/gsi/client)
     - Initializes with client ID: 801132168802-j8a7hetf3d6ke6ljb8tftb68sm0roqa5.apps.googleusercontent.com
     - Uses signInWithIdToken with provider "google" and ID token credential
     - On success: navigates to /dashboard

     What handles what:

     - useAuthStore → OAuth redirect flow (signInWithOAuth)
     - Auth component → Google One Tap (credential-based, no redirect)
     - Both converge on Supabase signInWithIdToken / signInWithOAuth

     Missing:

     - No explicit error handling for "invalid_client" or "access_denied" from Google
     - No fallback if One Tap is blocked by browser (ITP, FedCM)
     - No account linking flow UI (only linkGoogleAccount in store)

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     2. signUp / signIn Implementation

     signUp: async (t, s, r) => {  // t=name, s=email, r=password
       a({isLoading: true, error: null});
       await Ce("pre-sign-in");
       const i = await R.signUp(t, s, r);  // R = auth module
       if (i.success && i.user) {
         const n = i.sessionMode === "temporary-local";
         return a({
           isAuthenticated: true,
           userId: i.user.id,
           email: i.user.email || null,
           emailVerified: false,
           planType: "free",
           isTemporaryLocalSession: n,
           temporaryLocalMessage: n && i.sessionNotice || null,
           isLoading: false,
           error: null
         }), {success: true};
       }
       return a({isLoading: false, error: i.error || null}), {success: false, error: i.error};
     }

     signIn (useAuthStore-Aw1au7RF.js):

     signIn: async (t, s) => {  // t=email, s=password
       a({isLoading: true, error: null});
       await Ce("pre-sign-in");
       const r = await R.signIn(t, s);
       if (r.success && r.user) {
         if (r.sessionMode === "temporary-local") {
           // Local-only session (offline mode)
           return a({...isTemporaryLocalSession: true...}), {success: true};
         }
         // Cloud session - fetch user data, plan status
         const n = await R.fetchUserData(r.user.id);
         jt.getState().resetProfile();  // Reset profile store
         return a({...isAuthenticated: true, planType: n?.planType...}), {success: true};
       }
       return a({isLoading: false, error: r.error || null}), {success: false, error: r.error};
     }

     auth-bridge.js (fallback - lines 117-175):

     - login(email, password) → POST /auth/v1/token?grant_type=password
     - signUp(email, password) → POST /auth/v1/signup
     - Both write session to localStorage, call bootstrap, notify auth

     What handles what:

     - useAuthStore → Main state management, session persistence, plan sync
     - R (auth module) → Supabase client calls (signUp, signIn, signInWithOAuth)
     - auth-bridge → Fallback for Android/offline (direct REST calls)

     Missing:

     - No email verification enforcement on signup (user gets emailVerified: false)
     - No rate limiting / brute force protection visible
     - No MFA/2FA enrollment in signup flow
     - Password strength validation only checks length ≥ 6

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     3. Error Handling

     "Invalid API key"

     File: SettingsLayout-DkuooNHv.js (AI Assistant settings, ~line with I&&!I.valid)

     I && !I.valid && e.jsxs("div", {
       className: "p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex gap-2",
       children: [
         e.jsx(Le, {className: "w-4 h-4 shrink-0"}),
         I.error || "Invalid API key. Please check and try again."
       ]
     })

     - Context: Groq/Gemini AI provider API key validation (NOT Supabase auth)
     - Handled by: validateApiKey in AI store (useAIStore-DRa7CkEN.js)
     - UI: Shows inline error below API key input

     "mainstream inboxes"

     File: Auth-D0Y8CB1f.js (signup form, W component)

     e.jsx("p", {
       className: "text-xs text-zinc-500",
       children: "New signups are limited to mainstream inboxes like Gmail, Outlook, Yahoo, iCloud, and Proton Mail."
     })

     File: useAuthStore-Aw1au7RF.js (validation function la)

     la = a => {  // a = email
       const e = pt(a);  // parse email
       return e
         ? oa.test(e)    // regex validation
           ? ca(e)       // domain allowlist check
             ? null      // valid
             : "Use a mainstream inbox like Gmail, Outlook, Yahoo, iCloud, or Proton Mail. Disposable and uncommon domains are blocked for
     new signups."
           : "Enter a valid email address."
         : "Email is required.";
     }

     Domain allowlist (ca function):

     ca = a => {
       const e = ir(a);  // extract domain
       return !!(e && rr.has(e));  // rr = Set of allowed domains
     }

     What handles what:

     - UI warning in signup form (informational)
     - Actual blocking in la validator called during signUp (M(t) in Auth component)
     - Blocks disposable/uncommon domains for new signups only
     Missing:

     - No allowlist visible in bundle (minified as rr Set)
     - No admin override for custom domains
     - No distinction between signup vs signin (signin allows any domain)

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     4. redirectTo Parameter Usage

     ┌────────────────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────┐
     │Location                                                                │Usage                                                      │
     ├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │useAuthStore-Aw1au7RF.js → signInWithGoogle                             │`{redirectTo: window.ISO_OAUTH_REDIRECT                    │
     ├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │vendor-supabase-D_TSSuUW.js → signInWithOAuth / _handleProviderSignIn   │Passed to _getUrlForProvider → redirect_to query param     │
     ├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │vendor-supabase-D_TSSuUW.js → signInWithOtp                             │redirectTo: l?.emailRedirectTo                             │
     ├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │vendor-supabase-D_TSSuUW.js → verifyOtp                                 │redirectTo: n (from options)                               │
     ├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │vendor-supabase-D_TSSuUW.js → resetPasswordForEmail                     │redirectTo: t.redirectTo                                   │
     ├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │vendor-supabase-D_TSSuUW.js → updateUser                                │redirectTo: t?.emailRedirectTo                             │
     ├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │vendor-supabase-D_TSSuUW.js → linkIdentityOAuth                         │`redirectTo: (a=e.options)===null                          │
     ├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │auth-bridge.js                                                          │Not used (direct REST calls)                               │
     ├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │android-bridge.js → OAuth callback                                      │Hardcoded redirect to /dashboard after localhost callback  │
     └────────────────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────┘
     Android-specific:

     - window.__ISO_OAUTH_REDIRECT__ can be injected at build time
     - Default fallback: /auth/callback
     - Localhost callback handler (android-bridge.js:4412-4496) handles http://localhost/callback#access_token=...

     Missing:

     - No deep link handling for isotopeai:// scheme in OAuth redirect
     - No redirectTo for email magic links (only password reset)
     - No validation of redirectTo against allowlist (open redirect risk)

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     5. OAuth Flow Code

     Supabase Client (vendor-supabase-D_TSSuUW.js):

     ┌─────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────────┐
     │Function                                                 │Flow                                                                      │
     ├─────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
     │signInWithOAuth(provider, options)                       │→ _handleProviderSignIn → _getUrlForProvider → window.location.assign(url)│
     ├─────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
     │signInWithIdToken({provider, token, access_token, nonce})│POST /token?grant_type=id_token (Google One Tap, Apple)                   │
     ├─────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
     │`signInWithSSO({providerId                               │domain, options})`                                                        │
     ├─────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
     │_handleProviderSignIn                                    │Builds /authorize?provider=google&redirect_to=...&scopes=...              │
     │                                                         │&code_challenge=...                                                       │
     ├─────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
     │_getUrlForProvider                                       │PKCE: generates code_challenge + code_challenge_method=S256               │
     ├─────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
     │_exchangeCodeForSession(code)                            │POST /token?grant_type=pkce with code_verifier                            │
     ├─────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
     │getSessionFromURL                                        │Handles implicit (#access_token=...) and PKCE (?code=...) callbacks       │
     └─────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────────────────┘

     Android Bridge (android-bridge.js:4412-4496):

     // Localhost OAuth callback handler
     function handleLocalhostCallback() {
       // Parses hash: #access_token=...&refresh_token=...&expires_in=...&token_type=bearer
       // Stores in localStorage: isotope-auth-token, sb-{ref}-auth-token
       // Dispatches isotope:auth-unblock, isotope:sync_refresh
       // Upgrades user to "ranker" plan (dev/testing)
       // Redirects to /dashboard
     }

     - Triggers on http://localhost/callback with hash fragment
     - Listens for hashchange events

     Google One Tap (Auth-D0Y8CB1f.js):

     - Loads https://accounts.google.com/gsi/client
     - google.accounts.id.initialize({client_id, callback: async (credential) => { await S.auth.signInWithIdToken({provider: "google",
       token: credential.credential}) }})
     - Auto-prompts with google.accounts.id.prompt()

     What handles what:

     - Web: Supabase client handles full PKCE OAuth flow
     - Android (Capacitor): Localhost callback intercepts redirect
     - One Tap: Credential-based (no redirect), uses ID token grant

     Missing:

     - No state parameter validation visible (CSRF protection)
     - No PKCE code_verifier storage cleanup on error
     - No OAuth error handling UI (e.g., access_denied, server_error)
     - No silent auth / prompt=none support for session recovery
     - Apple Sign In not implemented (only Google)
     - No token refresh handling for provider tokens (Google access tokens expire in 1hr)

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     Summary: What's Missing / Gaps

     ┌──────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
     │Area              │Gap                                                                                                              │
     ├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Google OAuth      │No Apple/Microsoft/GitHub providers; no account linking UI; no token refresh for provider tokens                 │
     ├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Email/Password    │No password strength meter; no breach check (HaveIBeenPwned); no rate limiting                                   │
     ├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Email Validation  │Allowlist (rr) not visible; no admin override; blocks signups only (not signin)                                  │
     ├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │redirectTo        │No allowlist validation (open redirect risk); no deep link support                                               │
     ├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Error Handling    │No user-friendly OAuth error mapping; "Invalid API key" only for AI keys, not Supabase                           │
     ├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Session Management│No concurrent session limit; no device management UI; no forced re-auth for sensitive actions                    │
     ├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Android           │Localhost callback only works in dev; no custom scheme (isotopeai://) handler for production OAuth               │
     ├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Security          │No CSRF state in OAuth; no PKCE verifier cleanup on failure; refresh tokens stored in localStorage (accessible   │
     │                  │to XSS)                                                                                                          │
     └──────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

