
     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     Supabase Configuration Audit Report

     Summary

     The IsotopeAI APK uses a 3-tier configuration resolution system. The current state shows mismatched values between .env (production)
     and supabase.config.json (old development defaults).

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     1. app-config.json Structure & Loading

     File: /data/data/com.termux/files/home/isotope-apk/app-config.json (lines 1-22)

     {
       "supabase": {
         "url": "https://ollsqiutzartjhiuzkbf.supabase.co",
         "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...Ryt4Ak9Lx47lvKpMfKozDg0QjxBcP1IHdH7sgqc7x-M",
         "serviceRoleKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...AvlTGmmVOLDXJyhLGeooyGDGml60obsrCRvfReAM4RQ",
         "projectRef": "ollsqiutzartjhiuzkbf"
       },
       "app": { "version": "3.4.6", "name": "IsotopeAI" },
       "ai": { "geminiApiKey": "", "groqApiKey": "" },
       "sentry": { "dsn": "" },
       "yepapi": { "key": "" }
     }
     ┌───────────────────────┬────────────────────────────────────────────────┬───────────────────────────────────────────────────────────┐
     │Field                  │Value                                           │Notes                                                      │
     ├───────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │url                    │https://ollsqiutzartjhiuzkbf.supabase.co        │✅ Production project                                      │
     ├───────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │anonKey                │JWT (Ryt4Ak9Lx...)                              │✅ Matches .env                                            │
     ├───────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │serviceRoleKey         │JWT (AvlTGmmV...)                               │⚠️─ Secret exposed — should not be in committed file        │
     ├───────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │projectRef             │ollsqiutzartjhiuzkbf                            │✅ Matches URL                                             │
     └───────────────────────┴────────────────────────────────────────────────┴───────────────────────────────────────────────────────────┘

     Loading mechanism: Not directly loaded by runtime. Used as reference; build-www.js uses supabase-config.js which reads .env →
     supabase.config.json (see below).

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


     2. .env File Structure & supabase-config.js

     .env — /data/data/com.termux/files/home/isotope-apk/.env (lines 1-26)

     SUPABASE_URL=https://ollsqiutzartjhiuzkbf.supabase.co
     SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...Ryt4Ak9Lx47lvKpMfKozDg0QjxBcP1IHdH7sgqc7x-M
     SUPABASE_SERVICE_ROLE_KEY=                    ← EMPTY
     SUPABASE_PROJECT_REF=ollsqiutzartjhiuzkbf
     APP_VERSION=3.4.6
     APP_NAME=IsotopeAI
     GEMINI_API_KEY=
     GROQ_API_KEY=
     SENTRY_DSN=
     YEPAPI_KEY=

     supabase-config.js — /data/data/com.termux/files/home/isotope-apk/scripts/supabase-config.js (lines 1-81)

     Resolution precedence (highest → lowest):

     1. Process env (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PROJECT_REF)
     2. Root .env file (manual parse, no dependencies)
     3. supabase.config.json (committed defaults — old dev project)

     Key logic (lines 47-73):

     const url  = env.SUPABASE_URL  || dotEnv.SUPABASE_URL  || fileConfig.url  || '';
     const anon = env.SUPABASE_ANON_KEY || dotEnv.SUPABASE_ANON_KEY || fileConfig.anonKey || '';
     const ref  = env.SUPABASE_PROJECT_REF || dotEnv.SUPABASE_PROJECT_REF || fileConfig.projectRef ||
                  (url.match(/^https?:\/\/([^.]+)\.supabase\.co/) || [])[1] || '';

     Missing in .env:

     - SUPABASE_SERVICE_ROLE_KEY is empty (line 9) — required for admin operations

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     3. Where __ISO_SUPA_URL__, __ISO_ANON__, __ISO_PROJECT_REF__ Are Set

     A. android-bridge.js (root & www/) — Lines 20-21, 36-37

     // Root: /data/data/com.termux/files/home/isotope-apk/android-bridge.js
     var SUPA_URL       = 'https://vteqquoqvksshmfhuepu.supabase.co';  // ❌ OLD DEV PROJECT
     var SUPA_ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...ZkRislOhJRQUjVa1y5ixu-xBhlgkXWWyZKI_CClWj64';  // ❌ OLD KEY

     window.__ISO_SUPA_URL__  = SUPA_URL;
     window.__ISO_ANON__      = SUPA_ANON_KEY;

     B. www/index.html — Lines 51-70 (duplicated in two IIFEs)

     window.__ISO_SUPA_URL__ = 'https://ollsqiutzartjhiuzkbf.supabase.co';  // ✅ PROD
     window.__ISO_ANON__     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...Ryt4Ak9Lx...';  // ✅ PROD
     window.__ISO_PROJECT_REF__ = 'ollsqiutzartjhiuzkbf';  // ✅ PROD

     C. www/isotope-server-head.html — Lines 4-5

     window.__ISO_SUPA_URL__ = 'https://ollsqiutzartjhiuzkbf.supabase.co';  // ✅ PROD
     window.__ISO_ANON__     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...Ryt4Ak9Lx...';  // ✅ PROD (note: appears to have DOUBLE JWT)

     D. build-www.js injects at build time — Lines 154-166

     const supaConfigScript = `
     <script>
     (function(){
       'use strict';
       window.__ISO_SUPA_URL__ = '${supaUrl}';           // From .env via supabase-config.js
       window.__ISO_ANON__ = '${supaAnon}';
       window.__ISO_PROJECT_REF__ = '${supaRef}';
       window.__ISO_APP_VERSION__ = '3.4.6';
       window.__ISO_IS_ANDROID__ = true;
     })();
     </script>
     `;

     Critical finding: The root android-bridge.js has HARDCODED OLD DEV VALUES (project vteqquoqvksshmfhuepu), while www/index.html and
     isotope-server-head.html have PRODUCTION VALUES (ollsqiutzartjhiuzkbf). The build-www.js script patches android-bridge.js at build
     time (lines 308-315), but the source file in repo root remains stale.

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     4. How index.html Loads Config from app-config.json

     It does NOT load app-config.json directly.

     Actual flow:

     Actual flow:

     ┌─────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
     │Stage            │Mechanism                                                                                                         │
     ├─────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Build time       │build-www.js → calls loadConfig() from supabase-config.js → reads .env (priority) → supabase.config.json (        │
     │                 │fallback)                                                                                                         │
     ├─────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Runtime injection│build-www.js injects <script> with window.__ISO_SUPA_URL__, __ISO_ANON__, __ISO_PROJECT_REF__ into www/index.html │
     │                 │<head> (lines 154-166)                                                                                            │
     ├─────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │Android bridge   │android-bridge.js (loaded FIRST in <head> at line 5 of index.html) sets same globals as fallback                  │
     ├─────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │App code         │restore-and-launch.js, auth-bridge.js, android-bridge.js read window.__ISO_SUPA_URL__ / __ISO_ANON__              │
     └─────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

     index.html script loading order (lines 5-65):

     1. <script src="/android-bridge.js"></script> — sets globals from hardcoded values (patched at build)
     2. <script src="/android-floating-timer-bridge.js"></script>
     3. Inline script (line 51) — sets __ISO_SUPA_URL__, __ISO_ANON__, __ISO_PROJECT_REF__ (prod values)
     4. Another inline script (line 63) — duplicates the same
     5. auth-bridge.js (line 25) — reads window.__ISO_SUPA_URL__ || DEFAULT_SUPA_URL
     6. restore-and-launch.js (line 49) — reads window.__ISO_SUPA_URL__

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     ⚠️  Configuration Issues Found

     ┌───────────────────────────────────────┬───────────────────────────────────────────────┬────────────────────────────────────────────┐
     │Issue                                  │Location                                       │Severity                                    │
     ├───────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────┤
     │Root android-bridge.js has stale dev   │/data/data/com.termux/files/home/isotope-apk/  │🔴 Critical — if build step skipped, app    │
     │credentials                            │android-bridge.js:20-21                        │uses wrong project                          │
     ├───────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────┤
     │supabase.config.json points to OLD dev │/data/data/com.termux/files/home/isotope-apk/  │🟡 High — fallback tier is wrong            │
     │project                                │supabase.config.json:2-4                       │                                            │
     ├───────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────┤
     │SUPABASE_SERVICE_ROLE_KEY empty in .env│/data/data/com.termux/files/home/isotope-apk/. │🟡 High — admin operations will fail        │
     │                                       │env:9                                          │                                            │
     ├───────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────┤
     │Service role key exposed in app-config.│/data/data/com.termux/files/home/isotope-apk/  │🔴 Critical — secret in committed file      │
     │json                                   │app-config.json:5                              │                                            │
     ├───────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────┤
     │Double JWT in isotope-server-head.html │Line 5: ...Ryt4Ak9Lx...Ryt4Ak9Lx...            │🟡 Medium — malformed anon key              │
     ├───────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────┤
     │Duplicate global injection in index.   │Lines 51-56 and 63-68                          │🟢 Low — redundant but harmless             │
     │html                                   │                                               │                                            │
     └───────────────────────────────────────┴───────────────────────────────────────────────┴────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     Recommended Fixes

     1. Update supabase.config.json to match production project (ollsqiutzartjhiuzkbf)
     2. Update root android-bridge.js hardcoded values to production (or remove them entirely since build patches)
     3. Remove serviceRoleKey from app-config.json — use .env only
     4. Set SUPABASE_SERVICE_ROLE_KEY in .env for admin operations
     5. Fix double JWT in isotope-server-head.html (regenerate via extract-server-scripts.js)
