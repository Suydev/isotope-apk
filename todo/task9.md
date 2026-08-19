
     SECURITY AUDIT REPORT: isotope-apk

     Directory: /data/data/com.termux/files/home/isotope-apk/
     Date: 2026-08-18
     Scope: Full codebase — SQL migrations, client JS bundles, build scripts, config files

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     EXECUTIVE SUMMARY

     ┌─────────────────────────────┬────────────────────────────────────────────────────────────────────────────────┬─────────────────────┐
     │Area                         │Status                                                                          │Risk Level           │
     ├─────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │RLS Policies                 │✅ Comprehensive, hardened across 11 migrations                                 │Low                  │
     ├─────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │Service Role Key             │✅ Never in client code; only in DB GRANT statements                            │Low                  │
     ├─────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │Anon Key Exposure            │⚠️  Hardcoded in 3+ client files (by design for Supabase)                        │Medium               │
     ├─────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │JWT Handling                 │⚠️─ localStorage only; no httpOnly cookies; manual refresh                       │Medium               │
     ├─────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │CORS                         │❌ No explicit CORS headers in client; relies on Supabase defaults              │Medium               │
     ├─────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │AI API Keys                  │⚠️─ Client-side validation only; keys stored in localStorage                     │Medium               │
     ├─────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │Input Sanitization           │❌ Minimal; relies on React auto-escaping + Supabase parameterization           │Medium               │
     └─────────────────────────────┴────────────────────────────────────────────────────────────────────────────────┴─────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     1. RLS POLICIES ON ALL TABLES

     1. RLS POLICIES ON ALL TABLES

     Files: supabase/*.sql (12 migration files, 1,427 lines total)

     Tables with RLS Enabled & Policies Defined:

     ┌───────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┬────────────────────┐
     │Table                  │Key Policies                                                                           │Migration           │
     ├───────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
     │groups                 │groups_read_public, groups_read_authenticated, groups_insert_own, groups_update_own,   │009, 013, 013b, 013c│
     │                       │groups_update_owner, groups_delete_own (owner-only hard delete blocked; use RPC)       │                    │
     ├───────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
     │group_members          │gm_read_members, gm_self_delete, gm_join_public_group, gm_join_via_invite,             │009, 010, 013b, 013c│
     │                       │gm_insert_owner_self, gm_update_own_row (self-update only; role changes via RPC)       │                    │
     ├───────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
     │group_invites          │ginv_read, ginv_create (owner/admin/moderator), ginv_delete, invites_read_own_group (  │009, 013b, 013c     │
     │                       │admin/owner only)                                                                      │                    │
     ├───────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
     │group_announcements    │gann_read (public groups + members), gann_manager_write (owner/admin/moderator)        │009, 013c           │
     ├───────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
     │group_challenges       │gchall_read_public_or_member (public-group + active OR member), gchall_manager_write ( │009, 013c           │
     │                       │owner/admin/moderator)                                                                 │                    │
     ├───────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
     │community_join_requests│join_requests_select (group members), join_requests_insert (auth.uid() = user_id)      │014                 │
     ├───────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
     │users                  │users_read_member_profiles (member profiles readable by other members)                 │013d                │
     └───────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┴────────────────────┘

     Critical Hardening (013b, 013c):

     - Revoked anon INSERT on group_invites (013c:L22)
     - Dropped gm_client_insert_compat — allowed any authenticated user to insert into ANY group with ANY role (privilege escalation) (
       013c:L29)
     - Replaced gm_admin_update — allowed any group member to UPDATE any other member's row including role (013c:L35-40)
     - Fixed group_challenges anon read — was exposing private-group challenges via is_active=true (013c:L71-87)
     - Enabled RLS on groups, group_members, group_invites (013b:L15-17)
     - All RPCs are SECURITY DEFINER with strict input validation (009:L39-112, 009:L116-153)

     What's Missing / Gaps:

     ┌──────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────┐
     │Table                                 │Gap                                                                                          │
     ├──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
     │profiles / users                      │No explicit RLS shown in migrations (013d only adds users_read_member_profiles)              │
     ├──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
     │sessions / focus_sessions             │Not visible in migration files — may be in earlier migrations not in this folder             │
     ├──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
     │tasks, subjects, exams                │RLS not in these 12 files — verify in full Supabase schema                                   │
     ├──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
     │Audit logging                         │No pg_audit or row-level audit triggers visible                                              │
     └──────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     2. SERVICE ROLE KEY USAGE

     Files: supabase/009_community_hardening.sql (L518-525), .env (L9), .agent/DECISIONS.md (L125), .agent/ARCHITECTURE.md (L344)

     ┌──────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────┐
     │Table                                 │Gap                                                                                          │
     ├──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
     │profiles / users                      │No explicit RLS shown in migrations (013d only adds users_read_member_profiles)              │
     ├──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
     │sessions / focus_sessions             │Not visible in migration files — may be in earlier migrations not in this folder             │
     ├──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
     │tasks, subjects, exams                │RLS not in these 12 files — verify in full Supabase schema                                   │
     ├──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
     │Audit logging                         │No pg_audit or row-level audit triggers visible                                              │
     └──────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     2. SERVICE ROLE KEY USAGE

     Files: supabase/009_community_hardening.sql (L518-525), .env (L9), .agent/DECISIONS.md (L125), .agent/ARCHITECTURE.md (L344)

     Findings:

     ┌────────────────────────────────────┬───────────────────────────────────────────────────┬───────────────────────────────────────────┐
     │Location                            │Usage                                              │Risk                                       │
     ├────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │.env L9                             │SUPABASE_SERVICE_ROLE_KEY= (empty)                 │✅ Not set in repo                         │
     ├────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │009_community_hardening.sql L518-525│GRANT EXECUTE ON FUNCTION ... TO authenticated,    │✅ Server-side only; used for admin RPC    │
     │                                    │service_role                                       │grants                                     │
     ├────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │DECISIONS.md L125                   │"service-role key is NEVER included"               │✅ Documented policy                       │
     ├────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ARCHITECTURE.md L344                │"APK must never include a service-role key"        │✅ Documented policy                       │
     ├────────────────────────────────────┼───────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │restore-and-launch.js L298          │"Uses the user's own access_token so no            │✅ Confirmed in code                       │
     │                                    │service_role key needed"                           │                                           │
     └────────────────────────────────────┴───────────────────────────────────────────────────┴───────────────────────────────────────────┘

     Verdict:

     ✅ Service role key is properly confined to server-side Supabase operations. Never appears in client bundles, build scripts, or
     Android assets.

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     3. ANON KEY EXPOSURE

     Files: android-bridge.js (L21, L37, L535, L570-571, L1015, L1030, L1170, L1290, L1406, L1674, L1728, L2186, L2415, L2468, L2473,
     L2678, L3176-3177, L3444), www/android-bridge.js (same), scripts/build-www.js (L215, L312-313), scripts/extract-server-scripts.js (
     L54, L58), scripts/supabase-config.js (L60), www/assets/marketing-core-DzcTqL0l.js (L1302), .agent/DECISIONS.md (L114-130)

     Hardcoded Instances:

     ┌─────────────────────────────────┬────────────┬─────────────────────────────────────────────────────────────────────────────────────┐
     │File                             │Line        │Context                                                                              │
     ├─────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │android-bridge.js                │21          │var SUPA_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (double JWT!)           │
     ├─────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │www/android-bridge.js            │21          │Same double-JWT hardcoded value                                                      │
     ├─────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │android-bridge.js                │37          │window.__ISO_ANON__ = SUPA_ANON_KEY                                                  │
     ├─────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │android-bridge.js                │535         │anon: SUPA_ANON_KEY in config object                                                 │
     ├─────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │android-bridge.js                │570-571     │Headers: 'apikey': SUPA_ANON_KEY, 'Authorization': 'Bearer ' + (token ||             │
     │                                 │            │SUPA_ANON_KEY)                                                                       │
     ├─────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │marketing-core-DzcTqL0l.js       │1302        │VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (different project!)│
     ├─────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │scripts/build-www.js             │215, 312-313│Replaces hardcoded key at build time from .env                                       │
     ├─────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │scripts/extract-server-scripts.js│54, 58      │Reads from config, logs length                                                       │
     └─────────────────────────────────┴────────────┴─────────────────────────────────────────────────────────────────────────────────────┘
     The Double-JWT Problem:

     // Line 21 in android-bridge.js — TWO JWTs concatenated!
     var SUPA_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
     eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbHNxaXV0emFydGpoaXV6a2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MDkzMDksImV4cCI6MjEwMjE4NTMwOX0.
     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
     eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbHNxaXV0emFydGpoaXV6a2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MDkzMDksImV4cCI6MjEwMjE4NTMwOX0.
     Ryt4Ak9Lx47lvKpMfKozDg0QjxBcP1IHdH7sgqc7x-M';

     This is two valid JWTs concatenated (note the middle .eyJhbGci... — a second header). Supabase will reject this. The build script (
     build-www.js L312-313) replaces it at build time, but the committed source contains an invalid key.

     Different Projects:

     - android-bridge.js: Project ollsqiutzartjhiuzkbf (exp 2102)
     - marketing-core-DzcTqL0l.js: Project rcnekgzbdlwhcpmpoogz (exp 2080)
     - .env: Project ollsqiutzartjhiuzkbf

     Verdict:

     ⚠️  MEDIUM RISK — Anon key is designed to be public (Supabase docs), but:

     1. Double-JWT in committed source indicates build/release hygiene issue
     2. Two different project keys in codebase — marketing bundle may be stale
     3. Key rotation requires APK rebuild (documented in DECISIONS.md L130)

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     4. JWT HANDLING (STORAGE, VALIDATION)

     Files: www/android-bridge.js, www/auth-bridge.js, www/restore-and-launch.js, scripts/static-serve.js, www/assets/vendor-supabase-
     D_TSSuUW.js

     Storage:

     ┌───────────────────────────┬─────────────────────────────────────────────────────────────────────────────┬──────────────────────────┐
     │Token                      │Location                                                                     │Method                    │
     ├───────────────────────────┼─────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤
     │access_token               │localStorage.isotope-last-jwt                                                │Plain text                │
     ├───────────────────────────┼─────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤
     │refresh_token              │localStorage.isotope-last-rt                                                 │Plain text                │
     ├───────────────────────────┼─────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤
     │Full session               │localStorage.isotope-auth-token, localStorage.sb-{ref}-auth-token            │Plain text JSON           │
     ├───────────────────────────┼─────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤
     │Bootstrap cache            │localStorage.isotope-bootstrap-cache                                         │Plain text JSON           │
     └───────────────────────────┴─────────────────────────────────────────────────────────────────────────────┴──────────────────────────┘

     Code references:

     - android-bridge.js L1694-1695: localStorage.setItem('isotope-last-jwt', d.access_token); ... setItem('isotope-last-rt', d.
       refresh_token)
     - auth-bridge.js L45-48: Same pattern
     - restore-and-launch.js L228-233: Same pattern, with comment "refresh token in localStorage is standard for client-side Supabase"
     - static-serve.js L74-75: Dev login seeds same localStorage keys

     Validation:

     ┌───────────────────────┬────────────────────────────────────────────────────────────────────────────┬───────────────────────────────┐
     │Check                  │Implementation                                                              │File                           │
     ├───────────────────────┼────────────────────────────────────────────────────────────────────────────┼───────────────────────────────┤
     │JWT decode             │decodeJwtPayload() — base64url decode, no signature verification            │restore-and-launch.js L203-213 │
     ├───────────────────────┼────────────────────────────────────────────────────────────────────────────┼───────────────────────────────┤
     │Expiry check           │sessionExpiresSoon() — reads exp from decoded payload                       │restore-and-launch.js L215-220 │
     ├───────────────────────┼────────────────────────────────────────────────────────────────────────────┼───────────────────────────────┤
     │Refresh flow           │POST to /auth/v1/token?grant_type=refresh_token with apikey + refresh_token │restore-and-launch.js L238-267 │
     ├───────────────────────┼────────────────────────────────────────────────────────────────────────────┼───────────────────────────────┤
     │Server-side validation │Supabase validates JWT on every request (RLS, RPC auth)                     │N/A (Supabase)                 │
     └───────────────────────┴────────────────────────────────────────────────────────────────────────────┴───────────────────────────────┘

     Gaps:

     ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬──────────┐
     │Issue                                                                                                                    │Severity  │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────┤
     │No signature verification on client — trusts exp claim blindly                                                           │Medium    │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────┤
     │Refresh token in localStorage — stolen RT = long-lived session until rotation                                            │Medium    │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────┤
     │No httpOnly cookies — explicitly rejected in restore-and-launch.js L230-232 ("would break offline SW session restore")   │Medium    │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────┤
     │No token rotation on refresh — Supabase returns same RT by default                                                       │Low       │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────┤
     │No device binding / fingerprinting                                                                                       │Low       │
     └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴──────────┘

     5. CORS / CORS HEADERS

     Files: None found in client code. Searched for Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-
     Headers, cors, CORS.

     Findings:

     ┌─────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────┐
     │Layer                            │CORS Handling                                                                                     │
     ├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Supabase (server)                │Supabase API gateway handles CORS automatically for apikey + Authorization requests               │
     ├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Client (android-bridge.js)       │No CORS headers sent — browser handles preflight automatically for same-origin Supabase calls     │
     ├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Dev server (static-serve.js)     │No CORS headers — serves local files only                                                         │
     ├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Edge Functions / RPCs            │Invoked via Supabase client — CORS managed by Supabase                                            │
     └─────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────┘

     Verdict:

     ⚠️  ACCEPTABLE BUT IMPLICIT — No explicit CORS configuration in codebase. Relies entirely on Supabase's default CORS policy (allows
     all origins for anon key). For production, consider:

     - Restricting CORS origins in Supabase dashboard → API Settings
     - Adding origin header validation in any custom edge functions (none found)

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     6. API KEY VALIDATION FOR AI PROVIDERS

     Files: www/assets/useAIStore-DRa7CkEN.js, android-bridge.js (L531, L536), app-config.json (L13), .env (L19-20), scripts/extract-
     server-scripts.js (L62-64)

     Architecture:

     User enters API key in Settings
             ↓
     Client-side validation via provider's /models endpoint
             ↓
     Key stored in localStorage (via useAuthStore persistence)
             ↓
     Direct client → Provider API calls (Gemini: generativelanguage.googleapis.com, Groq: api.groq.com)

     Code (useAIStore-DRa7CkEN.js):

     // Gemini validation (L~1240)
     async validateApiKey(e) {
       const t = e || this.apiKey;
       if (!t) return {valid: false, error: "No API key provided"};
       const s = await fetch(`${Qe}/models?key=${t}`, {method: "GET"});
       return s.ok ? {valid: true} : {valid: false, error: ...};
     }

     // Groq validation (L~1200)
     async validateApiKey(e) {
       const s = await fetch("https://api.groq.com/openai/v1/models", {
         headers: {"Authorization": `Bearer ${t}`}
       });
       return s.ok ? {valid: true} : {valid: false, error: ...};
     }

     Key Storage:

     - app-config.json L13: "geminiApiKey": "" (empty default)
     - .env L19-20: GEMINI_API_KEY=, GROQ_API_KEY= (empty)
     - extract-server-scripts.js L63-64: const GEMINI_API_KEY = undefined; const GROQ_API_KEY = undefined;
     - Actual keys stored in Zustand store → persisted to localStorage via middleware

     Gaps:

     Gaps:

     ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┬──────────────────────┐
     │Issue                                                                                                        │Severity              │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────┤
     │Client-side only validation — no server-side proxy; keys exposed in browser memory/localStorage              │Medium                │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────┤
     │Keys in localStorage — accessible via XSS, devtools, malicious extensions                                    │Medium                │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────┤
     │No key rotation / expiry tracking                                                                            │Low                   │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────┤
     │No rate limiting / usage tracking on client                                                                  │Low                   │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────┤
     │Gemini key passed as query param (?key=...) — may appear in server logs, referrer headers                    │Medium                │
     ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────┤
     │Groq key in Authorization header — better, but still client-exposed                                          │Medium                │
     └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┴──────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     7. INPUT SANITIZATION

     Files: Searched for sanitize, escape, xss, XSS, DOMPurify, purify, dangerouslySetInnerHTML, innerHTML, v-html, eval(, Function(

     Findings:

     ┌───────────────────────┬────────────────────────────────────────────────┬───────────────────────────────────────────────────────────┐
     │Pattern                │Occurrences                                     │Context                                                    │
     ├───────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │dangerouslySetInnerHTML│0                                               │Not used                                                   │
     ├───────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │innerHTML              │1 (in vendor-sentry-C0ZzGV-C.js — minified      │Not app code                                               │
     │                       │vendor)                                         │                                                           │
     ├───────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │eval( / Function(      │2 in extract-server-scripts.js (L107, L119)     │Build-time only: template literal evaluation for server    │
     │                       │                                                │snippet extraction                                         │
     ├───────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │DOMPurify / sanitize   │0                                               │Not used                                                   │
     ├───────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │React JSX              │Throughout                                      │Auto-escapes by default                                    │
     └───────────────────────┴────────────────────────────────────────────────┴───────────────────────────────────────────────────────────┘

     Data Flow Sanitization:

     ┌──────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
     │Input Source                                          │Sanitization                                                                 │
     ├──────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
     │Supabase RPC parameters                               │Parameterized queries (PostgreSQL) — SQL injection prevented                 │
     ├──────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
     │Supabase REST API                                     │apikey + Authorization headers; body JSON — Supabase validates               │
     ├──────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
     │User-entered AI prompts                               │Sent directly to provider APIs — no sanitization in app                      │
     ├──────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
     │User-entered text (tasks, notes, etc.)                │Stored in Supabase via RPC/REST — parameterized                              │
     ├──────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
     │Markdown rendering                                    │vendor-markdown-core-dyexddTT.js — likely uses safe parser                   │
     ├──────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
     │URL parameters (invite codes)                         │get_invite_details(p_code text) — parameterized SQL function                 │
     └──────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘


     Gaps:

     ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬───────────────┐
     │Issue                                                                                                               │Severity       │
     ├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────┤
     │No centralized input validation layer — relies on Supabase parameterization + React auto-escape                     │Low-Medium     │
     ├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────┤
     │AI prompt injection — user prompts sent directly to Gemini/Groq without sanitization or prompt guards               │Medium         │
     ├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────┤
     │Markdown XSS — if markdown renderer allows raw HTML, potential XSS (need to verify vendor-markdown-core)            │Low            │
     ├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────┤
     │Invite code in URL — isotopeai://invite/{code} / https://.../invite/{code} — code passed to RPC, parameterized      │Low            │
     └────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴───────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     ADDITIONAL SECURITY OBSERVATIONS

     Authentication Flow:

     ┌───────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────┐
     │Component                          │Responsibility                                                                                  │
     ├───────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
     │android-bridge.js                  │Intercepts /__auth/* fetch calls; implements login/signup/refresh via Supabase REST             │
     ├───────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
     │auth-bridge.js                     │Defines window.__isoLogin, __isoUp globals; writes session to localStorage                      │
     ├───────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
     │restore-and-launch.js              │Boot-time session restore, refresh, onboarding check via Supabase RPC                           │
     ├───────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
     │pwa-local.js                       │Service worker; offline support; dismisses update prompts                                       │
     └───────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────┘

     Secure Defaults Enforced:

     - ✅ All RPCs SECURITY DEFINER with SET search_path = public
     - ✅ auth.uid() checks in every RLS policy
     - ✅ Owner-only delete via RPC (not direct RLS)
     - ✅ Role escalation prevented (self-update only; role changes via RPC)
     - ✅ Invite tokens not enumerable (RPC get_invite_details only)
     - ✅ Service role key never in client

     Missing / Recommended Hardening:

     ┌────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────┐
     │Area                                │Recommendation                                                                                 │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │CSP Headers                         │Add Content-Security-Policy to index.html / server (none found)                                │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Subresource Integrity               │Add integrity hashes to CDN scripts (none in index.html)                                       │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Referrer Policy                     │Set Referrer-Policy: strict-origin-when-cross-origin                                           │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Permissions Policy                  │Restrict sensor/payment/camera APIs not used                                                   │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │JWT Signature Verification          │Client-side verification using Supabase JWKS (for offline trust)                               │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │AI Key Proxy                        │Route AI calls through Supabase Edge Function to hide keys from client                         │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Refresh Token Rotation              │Enable in Supabase Auth settings (rotate on refresh)                                           │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Session Invalidation                │Implement "logout everywhere" via supabase.auth.admin.signOut (requires service role)          │
     ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
     │Audit Logging                       │Add pg_audit or custom audit table for sensitive operations                                    │
     └────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     FILE-BY-FILE SUMMARY

     ┌───────────────────────────────────────────────┬───────────────────────────────────────────┬────────────────────────────────────────┐
     │File                                           │Handles                                    │Missing / Issues                        │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │supabase/009_community_hardening.sql           │Core community RPCs + RLS                  │—                                       │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │supabase/010_cleanup_group_members_rls.sql     │Policy cleanup                             │—                                       │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │supabase/011_community_join_guard.sql          │Join request RLS                           │—                                       │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │supabase/013b_harden_rls_security.sql          │Critical RLS fixes (escalation, anon       │—                                       │
     │                                               │access)                                    │                                        │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │supabase/013c_consolidate_and_harden_rls.sql   │Policy consolidation, anon leak fixes      │—                                       │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │supabase/                                      │Profile read policy                        │—                                       │
     │013d_add_missing_user_fks_and_profile_read.sql │                                           │                                        │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │supabase/014_join_policy_join_requests.sql     │Join request RLS                           │—                                       │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │android-bridge.js / www/android-bridge.js      │Auth intercept, Supabase REST calls, AI    │Double-JWT hardcoded; anon key in source│
     │                                               │config                                     │                                        │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │auth-bridge.js                                 │Login/signup globals, session write        │localStorage only                       │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │restore-and-launch.js                          │Boot restore, refresh, onboarding check    │No JWT sig verify; RT in localStorage   │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │useAIStore-DRa7CkEN.js                         │AI provider integration, key validation    │Client-side only; keys in localStorage  │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │static-serve.js                                │Dev login, Capacitor spoof                 │Dev only; hardcoded different project   │
     │                                               │                                           │key                                     │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │extract-server-scripts.js                      │Build-time snippet extraction              │eval/new Function at build time         │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │supabase-config.js                             │Config resolution (env → .env → config.    │—                                       │
     │                                               │json)                                      │                                        │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │build-www.js                                   │Build-time key replacement, validation     │Replaces double-JWT pattern             │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │.env                                           │Local secrets (not committed with real     │Service role empty; AI keys empty       │
     │                                               │values)                                    │                                        │
     ├───────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤
     │app-config.json                                │Default AI key placeholders                │—                                       │
     └───────────────────────────────────────────────┴───────────────────────────────────────────┴────────────────────────────────────────┘

     PRIORITY ACTION ITEMS

     ┌────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┬─────────────────────┐
     │Priority    │Action                                                                                           │Effort               │
     ├────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │P1          │Fix double-JWT in android-bridge.js source (line 21) — commit valid single JWT or placeholder    │5 min                │
     ├────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │P1          │Align marketing bundle anon key (marketing-core-DzcTqL0l.js) with production project             │10 min               │
     ├────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │P2          │Enable Supabase JWT signature verification on client (fetch JWKS, verify access_token)           │2 hrs                │
     ├────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │P2          │Proxy AI API calls through Supabase Edge Function to remove keys from client                     │4 hrs                │
     ├────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │P2          │Add CSP headers to index.html / configure in Supabase hosting                                    │30 min               │
     ├────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │P3          │Enable refresh token rotation in Supabase Auth settings                                          │5 min (dashboard)    │
     ├────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │P3          │Add Referrer-Policy and Permissions-Policy headers                                               │15 min               │
     ├────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │P3          │Audit vendor-markdown-core for XSS safety                                                        │1 hr                 │
     ├────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────┤
     │P4          │Implement server-side audit logging for sensitive RPCs                                           │4 hrs                │
     └────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────┴─────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     End of Report
