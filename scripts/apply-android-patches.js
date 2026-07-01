#!/usr/bin/env node
/**
 * apply-android-patches.js
 *
 * Applies all runtime server.mjs patches to the bundled JS files in www/assets/
 * so the Android APK works without a Node.js server.
 *
 * Patches applied (mirrors server.mjs runtime patching logic):
 * 1. App-pJGjDiPw.js — replace Supabase placeholder constants, disable demo mode,
 *    fix plan_type, disable circuit breaker, disable local auth suppression
 * 2. sessionSync-mloIEnTd.js — 5 patches to prevent false "sync success" when offline
 * 3. AppAccessGate-B975UtK7.js — enable cloud bootstrap download on empty local
 * 4. useOnlineStatus-BJOTUERN.js — route online state through Capacitor Network
 * 5. useSyncStore-vWs_TdIc.js — route manual cloud sync/download through Android Storage helpers
 * 6. useInvites-D9RLFwf8.js — rename token_input → p_code for accept_invite RPC
 * 7. AndroidManifest.xml — add internet, notification, overlay, and file permissions
 */

const fs   = require('fs');
const path = require('path');

const WWW_DIR     = process.env.WWW_DIR || path.resolve(__dirname, '../www');
const ASSETS_DIR  = path.join(WWW_DIR, 'assets');
const ANDROID_DIR = process.env.ANDROID_DIR || path.resolve(__dirname, '../android');

// Supabase constants (injected into bundle for Android — no server-side injection)
const SUPA_URL      = 'https://vteqquoqvksshmfhuepu.supabase.co';
const SUPA_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0ZXFxdW9xdmtzc2htZmh1ZXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODU2NzUsImV4cCI6MjA5NTY2MTY3NX0.ZkRislOhJRQUjVa1y5ixu-xBhlgkXWWyZKI_CClWj64';

let patchCount = 0;
let skipCount  = 0;
let failureCount = 0;

// ── Helper ───────────────────────────────────────────────────────────────────

function patchFile(filePath, patches, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  SKIP (not found): ${label}`);
    skipCount++;
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const [from, to, required] of patches) {
    if (required && content.includes(to)) {
      continue;
    }
    const matchCount = content.split(from).length - 1;
    if (required && matchCount !== 1) {
      if (matchCount === 0 && content.includes(to)) {
        continue;
      }
      console.error(`  ERROR: Required patch target for ${label} appeared ${matchCount} times; expected exactly 1: "${from.slice(0, 120)}..."`);
      failureCount++;
      continue;
    }
    if (matchCount > 0) {
      content = content.split(from).join(to);
      changed = true;
      patchCount++;
    } else if (required) {
      console.error(`  ERROR: Required patch target not found in ${label}: "${from.slice(0, 80)}..."`);
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Patched: ${label}`);
  } else {
    console.log(`  ○ No changes needed: ${label}`);
  }
}

function findAsset(pattern) {
  if (!fs.existsSync(ASSETS_DIR)) return null;
  const files = fs.readdirSync(ASSETS_DIR);
  const matches = files.filter(f => f.includes(pattern) && f.endsWith('.js'));
  if (matches.length === 0) return null;
  // Prefer the largest file — avoids picking empty re-export chunks (0KB stubs)
  matches.sort((a, b) => {
    const sizeA = fs.statSync(path.join(ASSETS_DIR, a)).size;
    const sizeB = fs.statSync(path.join(ASSETS_DIR, b)).size;
    return sizeB - sizeA;
  });
  const chosen = matches[0];
  if (matches.length > 1) {
    console.log(`  (found ${matches.length} candidates for "${pattern}", chose largest: ${chosen})`);
  }
  return path.join(ASSETS_DIR, chosen);
}

function findAssetContaining(pattern, requiredText) {
  if (!fs.existsSync(ASSETS_DIR)) return null;
  const files = fs.readdirSync(ASSETS_DIR)
    .filter(f => f.includes(pattern) && f.endsWith('.js'))
    .map(f => path.join(ASSETS_DIR, f));
  const matches = files.filter(file => fs.readFileSync(file, 'utf8').includes(requiredText));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    console.error(`  ERROR: Asset content selector for "${pattern}" matched ${matches.length} files; expected 1`);
    failureCount++;
    return matches[0];
  }
  return matches[0];
}

function normalizeManifestPermissions(manifest, desiredPermissionLines) {
  const desiredByName = new Map();
  for (const line of desiredPermissionLines) {
    const name = line.match(/android:name="([^"]+)"/)?.[1];
    if (name) desiredByName.set(name, line.trim());
  }

  const existingLines = manifest.match(/^\s*<uses-permission\b[^>]*\/>\s*$/gm) || [];
  const existingByName = new Map();
  for (const line of existingLines) {
    const name = line.match(/android:name="([^"]+)"/)?.[1];
    if (name && !desiredByName.has(name) && !existingByName.has(name)) {
      existingByName.set(name, line.trim());
    }
  }

  manifest = manifest
    .replace(/^\s*<uses-permission\b[^>]*\/>\s*$/gm, '')
    .replace(/^\s*<!-- Permissions -->\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');

  const orderedLines = [
    ...desiredByName.values(),
    ...existingByName.values(),
  ].map(line => '    ' + line.replace(/^\s+/, ''));

  if (!manifest.includes('<application')) return manifest;
  return manifest.replace(/(\n\s*)<application/, '\n' + orderedLines.join('\n') + '\n    <application');
}

// ── 1. App main bundle ────────────────────────────────────────────────────────

console.log('\n=== Patching App main bundle ===');
const appBundle = findAsset('App-') || path.join(ASSETS_DIR, 'App-pJGjDiPw.js');

patchFile(appBundle, [
  // Replace Supabase URL placeholder
  ['__ISOTOPE_SUPABASE_URL__', SUPA_URL, false],
  // Replace Supabase anon key placeholder
  ['__ISOTOPE_SUPABASE_ANON_KEY__', SUPA_ANON_KEY, false],
  // Disable demo mode gate (server.mjs: ge = () => !1,)
  [
    'ge=()=>typeof window>"u"?!1:Ys(window.location.pathname)||window.sessionStorage.getItem(Et)==="1"',
    'ge=()=>!1',
    false
  ],
  // Alternate demo mode pattern
  [
    'ge = () => typeof window > "u" ? !1 : Ys(window.location.pathname) || window.sessionStorage.getItem(Et) === "1",',
    'ge = () => !1,',
    false
  ],
  // Fix default plan_type from "scholar" to "ranker"
  ['planType:"scholar"', 'planType:"ranker"', false],
  ['plan_type:"scholar"', 'plan_type:"ranker"', false],
  // Disable circuit breaker (prevents request lockouts under load)
  ['function O(a){if(!a)return!1;', 'function O(a){return!1;if(!a)return!1;', false],
  ['function O(a) {\n    return !0; if (!a) return !0;', 'function O(a) {\n    return !1; if (!a) return !1;', false],
  // Remove local-server "online check" requirement from sync
  ['__isoSyncAuthBlocked', '__isoSyncAuthBlocked_noop', false],
  [
    [
      'fr = {',
      '        getItem: async a => {',
      '            const e = await x.getItem(a);',
      '            return typeof e == "string" ? e : null',
      '        },',
      '        setItem: async (a, e) => {',
      '            await x.setItem(a, e)',
      '        },',
      '        removeItem: async a => {',
      '            await x.removeItem(a)',
      '        }',
      '    },'
    ].join('\n'),
    [
      'fr = {',
      '        getItem: async a => {',
      '            const e = await x.getItem(a);',
      '            if (typeof e == "string") return e;',
      '            if (typeof window < "u" && window.__ISO_IS_ANDROID__ && window.localStorage) {',
      '                const t = window.localStorage.getItem(a);',
      '                if (typeof t == "string") return t;',
      '                if (a === "isotope-auth-token") {',
      '                    const s = window.localStorage.getItem("sb-vteqquoqvksshmfhuepu-auth-token") || window.localStorage.getItem("isotope-last-session-raw");',
      '                    if (typeof s == "string") return s',
      '                }',
      '            }',
      '            return null',
      '        },',
      '        setItem: async (a, e) => {',
      '            await x.setItem(a, e);',
      '            if (typeof window < "u" && window.__ISO_IS_ANDROID__ && window.localStorage) {',
      '                window.localStorage.setItem(a, e);',
      '                if (a === "isotope-auth-token") window.localStorage.setItem("sb-vteqquoqvksshmfhuepu-auth-token", e)',
      '            }',
      '        },',
      '        removeItem: async a => {',
      '            await x.removeItem(a);',
      '            if (typeof window < "u" && window.__ISO_IS_ANDROID__ && window.localStorage) {',
      '                window.localStorage.removeItem(a);',
      '                if (a === "isotope-auth-token") window.localStorage.removeItem("sb-vteqquoqvksshmfhuepu-auth-token")',
      '            }',
      '        }',
      '    },'
    ].join('\n'),
    true
  ],
  [
    's = (a.icon ?.trim() || "📌").slice(0, ns),',
    's = typeof window < "u" && typeof window.__isoNormalizeFocusIcon == "function" ? window.__isoNormalizeFocusIcon(a.icon, t, e) : (a.icon ?.trim() || "📌").slice(0, ns),',
    true
  ],
], 'App-pJGjDiPw.js');

// ── 2. sessionSync bundle — 5 patches ────────────────────────────────────────

console.log('\n=== Patching sessionSync bundle ===');
const sessionSyncBundle = findAsset('sessionSync-') || path.join(ASSETS_DIR, 'sessionSync-mloIEnTd.js');

// These patches prevent the sync bundle from reporting false success
// when there's no local server (Android native mode).
patchFile(sessionSyncBundle, [
  // Patch 1: Don't clear pending queue on server error (keep retrying)
  ['"SYNC_COMPLETE"', '"SYNC_QUEUED"', false],
  // Patch 2: Treat Android native as "online" for session sync purposes
  [
    'if(!navigator.onLine)return',
    'if(!navigator.onLine&&!window.__ISO_IS_ANDROID__)return',
    false
  ],
  // Patch 3: Use direct Supabase RPC instead of server endpoint
  [
    '/__supa/functions/v1/finish-session',
    '/functions/v1/finish-session',
    false
  ],
  // Patch 4: Don't block on server health check for Android
  [
    'await localServerCheck()',
    'await (window.__ISO_IS_ANDROID__?Promise.resolve({ok:true}):localServerCheck())',
    false
  ],
  // Patch 5: Ensure pending sessions persist through Android process death
  [
    'sessionStorage.setItem("isotope:pending_session_sync"',
    'localStorage.setItem("isotope:pending_session_sync"',
    false
  ],
  [
    'sessionStorage.getItem("isotope:pending_session_sync"',
    'localStorage.getItem("isotope:pending_session_sync"',
    false
  ],
  [
    'sessionStorage.removeItem("isotope:pending_session_sync"',
    'localStorage.removeItem("isotope:pending_session_sync"',
    false
  ],
], 'sessionSync bundle');

// ── 3. AppAccessGate — cloud bootstrap ───────────────────────────────────────

console.log('\n=== Patching AppAccessGate bundle ===');
const accessGateBundle = findAsset('AppAccessGate-') || path.join(ASSETS_DIR, 'AppAccessGate-B975UtK7.js');

patchFile(accessGateBundle, [
  // Ensure cloud snapshot download is triggered on empty local state
  // The server patches this to always attempt cloud restore on new device
  [
    'if(isLocalWorkspaceEmpty()&&restore_recommended)',
    'if((isLocalWorkspaceEmpty()||window.__ISO_IS_ANDROID__)&&restore_recommended)',
    false
  ],
  // Do not let the pre-login boot snapshot force /auth after native login has
  // already hydrated the compiled auth store.
  [
    'if (Y === "readyLoggedOut") return r.jsx(z, {',
    'if (Y === "readyLoggedOut" && !u) return r.jsx(z, {',
    true
  ],
  // The browser cleanup/migration path must not remove Android auth-session
  // keys. The native auth bridge writes these keys for Supabase session restore.
  [
    'st = new Set(["isotope-auth", "isotope-onboarding", "isotope-notifications", "isotope-tools-storage", "ai-storage", "isotope-quotes", "sidebar-storage", "group-ui-preferences", "isotope-query-cache", "isotope-auth-token", "isotope:pending_session_sync", "isotope_device_id", "device_id", "isotope_intro_seen", "focus-bg-image", "focus-distractions", "session-custom-goals", "pwa-banner-dismissed", "pwa-install-dismissed", "notification-prompt-dismissed", "challenge_reminders", "isotope_scheduled_challenges", "isotope_completed_challenges", "tools-last-reset"])',
    'st = new Set(["isotope-onboarding", "isotope-notifications", "isotope-tools-storage", "ai-storage", "isotope-quotes", "sidebar-storage", "group-ui-preferences", "isotope-query-cache", "isotope:pending_session_sync", "isotope_device_id", "device_id", "isotope_intro_seen", "focus-bg-image", "focus-distractions", "session-custom-goals", "pwa-banner-dismissed", "pwa-install-dismissed", "notification-prompt-dismissed", "challenge_reminders", "isotope_scheduled_challenges", "isotope_completed_challenges", "tools-last-reset"])',
    true
  ],
], 'AppAccessGate bundle');

// ── 4. Auth bundle — login must route from bootstrap decision only ───────────

console.log('\n=== Patching Auth bundle ===');
const authBundle = findAsset('Auth-') || path.join(ASSETS_DIR, 'Auth-Cw0VAaCZ.js');

patchFile(authBundle, [
  [
    [
      'p = async h => {',
      '            h.preventDefault(), u(null), (await j(s, t)).success && setTimeout(() => {',
      '                b("/dashboard", {',
      '                    replace: !0',
      '                })',
      '            }, 100)',
      '        }, N = async () => {'
    ].join('\n'),
    [
      'p = async h => {',
      '            h.preventDefault(), u(null), m.setState({',
      '                isLoading: !0,',
      '                error: null',
      '            });',
      '            try {',
      '                if (typeof window.__isoLogin != "function") throw new Error("Android auth bridge is not ready");',
      '                var __r = await window.__isoLogin(s, t);',
      '                if (!__r || !__r.ok) {',
      '                    m.setState({',
      '                        error: __r && (__r.err || __r.error) || "Login failed",',
      '                        isLoading: !1',
      '                    });',
      '                    return',
      '                }',
      '                var __completed = __r.bootstrap && __r.bootstrap.onboarding && typeof __r.bootstrap.onboarding.completed == "boolean" ? __r.bootstrap.onboarding.completed : typeof __r.onboarding_completed == "boolean" ? __r.onboarding_completed : void 0;',
      '                if (typeof __completed != "boolean") {',
      '                    m.setState({',
      '                        error: "Could not verify cloud onboarding state. Check your connection and try again.",',
      '                        isLoading: !1',
      '                    });',
      '                    return',
      '                }',
      '                var __nativeUser = __r.user || __r.session && __r.session.user || {};',
      '                var __profile = __r.bootstrap && (__r.bootstrap.profile || __r.bootstrap.profile_data) || {};',
      '                var __plan = __r.bootstrap && __r.bootstrap.user && __r.bootstrap.user.plan_type || __profile.planType || __profile.plan_type || "ranker";',
      '                var __bootState = __completed ? "readyDashboard" : "readyNeedsOnboarding";',
      '                try {',
      '                    window.__ISO_BOOT_STATE__ = Object.assign({}, window.__ISO_BOOT_STATE__ || {}, {',
      '                        state: __bootState,',
      '                        session: __r.session || null,',
      '                        user_id: __nativeUser.id || __r.user_id || __r.bootstrap && __r.bootstrap.user_id || null,',
      '                        user: __nativeUser,',
      '                        profile: __r.bootstrap && __r.bootstrap.profile || __profile || null,',
      '                        profile_data: __r.bootstrap && __r.bootstrap.profile_data || __profile || null,',
      '                        onboarding: __r.bootstrap && __r.bootstrap.onboarding || {',
      '                            state: __completed ? "completed" : "incomplete",',
      '                            completed: __completed,',
      '                            completed_at: null,',
      '                            data: {}',
      '                        },',
      '                        onboarding_completed: __completed,',
      '                        cloud_snapshot: __r.bootstrap && __r.bootstrap.cloud_snapshot || null,',
      '                        best_backup: __r.bootstrap && __r.bootstrap.best_backup || null,',
      '                        backup_candidates: __r.bootstrap && __r.bootstrap.backup_candidates || [],',
      '                        restore_recommended: !!(__r.bootstrap && __r.bootstrap.restore_recommended),',
      '                        backup_warning: __r.bootstrap && __r.bootstrap.backup_warning || null,',
      '                        fetched_at: __r.bootstrap && __r.bootstrap.fetched_at || new Date().toISOString(),',
      '                        source: "android-auth-login"',
      '                    });',
      '                    window.dispatchEvent(new CustomEvent("isotope:boot-state", {',
      '                        detail: window.__ISO_BOOT_STATE__',
      '                    }))',
      '                } catch (__ignoredBootState) {}',
      '                m.setState({',
      '                    isAuthenticated: !0,',
      '                    isInitialized: !0,',
      '                    isLoading: !1,',
      '                    userId: __nativeUser.id || __r.user_id || __r.bootstrap && __r.bootstrap.user_id || null,',
      '                    email: __nativeUser.email || null,',
      '                    emailVerified: __nativeUser.email_confirmed_at != null,',
      '                    planType: __plan,',
      '                    planExpiresAt: __profile.planExpiresAt || __profile.plan_expires_at || null,',
      '                    accessSource: __profile.accessSource || __profile.access_source || "grandfathered",',
      '                    billingStatus: __profile.billingStatus || __profile.billing_status || "active",',
      '                    cancelAtPeriodEnd: __profile.cancelAtPeriodEnd || __profile.cancel_at_period_end || !1,',
      '                    portalEligible: __profile.portalEligible || __profile.portal_eligible || !1,',
      '                    authMethod: "email",',
      '                    identities: __nativeUser.identities || [],',
      '                    createdAt: __nativeUser.created_at || new Date().toISOString(),',
      '                    isTemporaryLocalSession: !1,',
      '                    temporaryLocalMessage: null,',
      '                    error: null',
      '                });',
      '                try {',
      '                    window.dispatchEvent(new CustomEvent("isotope:native-auth-ready", {',
      '                        detail: {',
      '                            session: __r.session || null,',
      '                            bootstrap: __r.bootstrap || null',
      '                        }',
      '                    }))',
      '                } catch (__ignored) {}',
      '                b(__bootState === "readyDashboard" ? "/dashboard" : "/onboarding", {',
      '                    replace: !0',
      '                })',
      '            } catch (__e) {',
      '                m.setState({',
      '                    error: __e && __e.message ? __e.message : "Login failed",',
      '                    isLoading: !1',
      '                })',
      '            }',
      '        }, N = async () => {'
    ].join('\n'),
    true
  ],
], 'Auth bundle');

// ── 4b. App bundle — disable web PWA manager in native Android ──────────────

console.log('\n=== Patching Android app shell bundle ===');
patchFile(appBundle, [
  [
    'children: [S.jsx(mn, {}), S.jsx(pn, {})]',
    'children: [typeof window < "u" && window.__ISO_IS_ANDROID__ ? null : S.jsx(mn, {}), S.jsx(pn, {})]',
    true
  ],
], 'App bundle PWA manager');

// ── 4c. useOnlineStatus — use Capacitor Network state on Android ────────────

console.log('\n=== Patching online status hook ===');
const onlineStatusBundle = findAsset('useOnlineStatus-');

patchFile(onlineStatusBundle, [
  [
    [
      'function a() {',
      '    const [r, t] = n.useState(navigator.onLine), [e, i] = n.useState(!1);',
      '    return n.useEffect(() => {',
      '        const s = () => {',
      '                t(!0), e && i(!1)',
      '            },',
      '            o = () => {',
      '                t(!1), i(!0)',
      '            };',
      '        return window.addEventListener("online", s), window.addEventListener("offline", o), () => {',
      '            window.removeEventListener("online", s), window.removeEventListener("offline", o)',
      '        }',
      '    }, [e]), {',
      '        isOnline: r,',
      '        wasOffline: e',
      '    }',
      '}'
    ].join('\n'),
    [
      'function a() {',
      '    const d = () => typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoIsOnline == "function" ? window.__isoIsOnline() : navigator.onLine,',
      '        [r, t] = n.useState(d),',
      '        [e, i] = n.useState(!1);',
      '    return n.useEffect(() => {',
      '        const s = () => {',
      '                t(!0), e && i(!1)',
      '            },',
      '            o = () => {',
      '                t(!1), i(!0)',
      '            },',
      '            c = u => {',
      '                const f = !!(u && u.detail && (u.detail.connected ?? u.detail.online));',
      '                f ? s() : o()',
      '            };',
      '        return t(d()), window.addEventListener("online", s), window.addEventListener("offline", o), window.addEventListener("isotope:network", c), () => {',
      '            window.removeEventListener("online", s), window.removeEventListener("offline", o), window.removeEventListener("isotope:network", c)',
      '        }',
      '    }, [e]), {',
      '        isOnline: r,',
      '        wasOffline: e',
      '    }',
      '}'
    ].join('\n'),
    true
  ],
], 'useOnlineStatus bundle');

// ── 5. useSyncStore — manual sync/download must use Android backup helpers ───

console.log('\n=== Patching useSyncStore bundle ===');
const syncStoreBundle = findAsset('useSyncStore-');

patchFile(syncStoreBundle, [
  [
    [
      '        triggerSync: async () => {',
      '            const t = u.getState(),',
      '                {',
      '                    userId: r,',
      '                    isAuthenticated: s',
      '                } = t,',
      '                a = t.isPremium();',
      '            if (!s || !r || !a) return;',
      '            const o = await n();',
      '            await o.fullManualSync(r, a), await l(), o.getState().status === "success" && e({',
      '                needsCloudBootstrap: !1,',
      '                bootstrapChecked: !0',
      '            })',
      '        },'
    ].join('\n'),
    [
      '        triggerSync: async () => {',
      '            const t = u.getState(),',
      '                {',
      '                    userId: r,',
      '                    isAuthenticated: s',
      '                } = t,',
      '                a = t.isPremium();',
      '            if (!s || !r || String(r).startsWith("local-")) {',
      '                const o = new Error("Cloud session missing. Log in again before syncing.");',
      '                e({',
      '                    status: "error",',
      '                    error: o.message',
      '                });',
      '                throw o',
      '            }',
      '            if (!a) {',
      '                const o = new Error("Cloud sync requires premium access.");',
      '                e({',
      '                    status: "error",',
      '                    error: o.message',
      '                });',
      '                throw o',
      '            }',
      '            if (typeof window < "u" && typeof window.__isoGetValidJwt == "function") {',
      '                const o = await window.__isoGetValidJwt();',
      '                if (!o) {',
      '                    const c = new Error("Cloud session missing. Log in again before syncing.");',
      '                    typeof window.__isoSyncAuthBlock == "function" && window.__isoSyncAuthBlock(c.message);',
      '                    e({',
      '                        status: "error",',
      '                        error: c.message',
      '                    });',
      '                    throw c',
      '                }',
      '            }',
      '            e({',
      '                status: "syncing",',
      '                error: null',
      '            });',
      '            try {',
      '                typeof window < "u" && typeof window.__isoRunManualCloudSync == "function" ? await window.__isoRunManualCloudSync(null, null, "header_manual_sync") : await (await n()).fullManualSync(r, a);',
      '                await l(), e({',
      '                    status: "success",',
      '                    lastSyncAt: new Date().toISOString(),',
      '                    error: null,',
      '                    needsCloudBootstrap: !1,',
      '                    bootstrapChecked: !0',
      '                })',
      '            } catch (c) {',
      '                const b = c && c.message ? c.message : "Sync failed";',
      '                e({',
      '                    status: "error",',
      '                    error: b',
      '                });',
      '                throw c',
      '            }',
      '        },'
    ].join('\n'),
    true
  ],
  [
    [
      '        downloadCloudSnapshot: async () => {',
      '            const t = u.getState(),',
      '                {',
      '                    userId: r,',
      '                    isAuthenticated: s',
      '                } = t,',
      '                a = t.isPremium();',
      '            if (!s || !r || !a) return;',
      '            const o = await n();',
      '            await o.downloadCloudSnapshot(r, a), await l(), o.getState().status === "success" && e({',
      '                needsCloudBootstrap: !1,',
      '                bootstrapChecked: !0',
      '            })',
      '        },'
    ].join('\n'),
    [
      '        downloadCloudSnapshot: async () => {',
      '            const t = u.getState(),',
      '                {',
      '                    userId: r,',
      '                    isAuthenticated: s',
      '                } = t,',
      '                a = t.isPremium();',
      '            if (!s || !r || String(r).startsWith("local-")) {',
      '                const o = new Error("Cloud session missing. Log in again before downloading cloud data.");',
      '                e({',
      '                    status: "error",',
      '                    error: o.message',
      '                });',
      '                throw o',
      '            }',
      '            if (!a) {',
      '                const o = new Error("Cloud restore requires premium access.");',
      '                e({',
      '                    status: "error",',
      '                    error: o.message',
      '                });',
      '                throw o',
      '            }',
      '            if (typeof window < "u" && typeof window.__isoGetValidJwt == "function") {',
      '                const o = await window.__isoGetValidJwt();',
      '                if (!o) {',
      '                    const c = new Error("Cloud session missing. Log in again before downloading cloud data.");',
      '                    typeof window.__isoSyncAuthBlock == "function" && window.__isoSyncAuthBlock(c.message);',
      '                    e({',
      '                        status: "error",',
      '                        error: c.message',
      '                    });',
      '                    throw c',
      '                }',
      '            }',
      '            e({',
      '                status: "syncing",',
      '                error: null',
      '            });',
      '            try {',
      '                typeof window < "u" && typeof window.__isoDownloadAndImportBackup == "function" ? await window.__isoDownloadAndImportBackup(null, "header_download_cloud_data") : await (await n()).downloadCloudSnapshot(r, a);',
      '                await l(), e({',
      '                    status: "success",',
      '                    lastSyncAt: new Date().toISOString(),',
      '                    error: null,',
      '                    needsCloudBootstrap: !1,',
      '                    bootstrapChecked: !0',
      '                })',
      '            } catch (c) {',
      '                const b = c && c.message ? c.message : "Cloud data download failed";',
      '                e({',
      '                    status: "error",',
      '                    error: b',
      '                });',
      '                throw c',
      '            }',
      '        },'
    ].join('\n'),
    true
  ],
], 'useSyncStore bundle');

// ── 6. useInvites — fix RPC parameter name ───────────────────────────────────

console.log('\n=== Patching useInvites bundle ===');
const invitesBundle = findAsset('useInvites-') || path.join(ASSETS_DIR, 'useInvites-D9RLFwf8.js');

patchFile(invitesBundle, [
  // rename token_input → p_code for accept_invite and get_invite_details RPCs
  ['"token_input":', '"p_code":', false],
  ['token_input:', 'p_code:', false],
], 'useInvites bundle');

console.log('\n=== Patching invite route bundle ===');
const inviteRouteBundle = findAsset('InviteOnlineOnlyRoute-');

patchFile(inviteRouteBundle, [
  [
    'm.success&&o(`/community/group/${m.group_slug}`)',
    'm.success&&o(`/community/group/${m.group_slug||m.slug||m.group_id}`)',
    true
  ],
], 'InviteOnlineOnlyRoute bundle');

// ── 6b. Community bundles — remove stale premium locks and add join by code ──

console.log('\n=== Patching community group bundles ===');
const groupDiscoveryBundle = findAsset('GroupDiscovery-');
const useGroupsBundle = findAsset('useGroups-');
const communityHubBundle = findAsset('CommunityHub-');
const singleGroupBundle = findAsset('SingleGroup-');
const useLeaderboardBundle = findAsset('useLeaderboard-');

patchFile(groupDiscoveryBundle, [
  [
    'e.jsxs("button",{onClick:()=>f(!0),className:"flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 font-bold text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-700 sm:w-auto",children:[e.jsx(B,{className:"w-4 h-4"}),"Create Group"]})',
    'e.jsxs("div",{className:"flex w-full flex-col gap-2 sm:w-auto sm:flex-row",children:[e.jsxs("button",{onClick:()=>{const t=window.prompt("Enter invite code or invite link");if(t){const j=String(t).trim().split(/[\\\\/]/).filter(Boolean).pop();j&&(window.location.href="/invite/"+encodeURIComponent(j))}},className:"flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 font-bold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 sm:w-auto",children:[e.jsx(B,{className:"w-4 h-4"}),"Join with Code"]}),e.jsxs("button",{onClick:()=>f(!0),className:"flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 font-bold text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-700 sm:w-auto",children:[e.jsx(B,{className:"w-4 h-4"}),"Create Group"]})]})',
    true
  ],
  ['{value:"shit",label:"Shit"}', '{value:"other",label:"Other"}', true],
  [
    've=n=>e.jsx($,{featureName:"Study Groups",children:e.jsx(H,{...n})});',
    've=n=>e.jsx(H,{...n});',
    true
  ],
], 'GroupDiscovery bundle');

patchFile(useGroupsBundle, [
  [
    '    } = r, s = c(n => n.isPremium());',
    '    } = r, s = !0;',
    true
  ],
  [
    '    const i = c(e => e.isPremium());',
    '    const i = !0;',
    true
  ],
  [
    [
      '    const i = c(t => t.userId),',
      '        e = c(t => t.isPremium());'
    ].join('\n'),
    [
      '    const i = c(t => t.userId),',
      '        e = !0;'
    ].join('\n'),
    true
  ],
  [
    [
      '    const i = c(s => s.userId),',
      '        e = c(s => s.isPremium()),',
      '        {'
    ].join('\n'),
    [
      '    const i = c(s => s.userId),',
      '        e = !0,',
      '        {'
    ].join('\n'),
    true
  ],
], 'useGroups bundle');

patchFile(communityHubBundle, [
  [
    'function ze(){const t=E(i=>i.isPremium()),n=E(i=>i.userId);',
    'function ze(){const t=!0,n=E(i=>i.userId);',
    true
  ],
  [
    'dr=t=>e.jsx(pe,{featureName:"Community Hub",children:e.jsx(Ae,{...t})});',
    'dr=t=>e.jsx(Ae,{...t});',
    true
  ],
], 'CommunityHub bundle');

patchFile(singleGroupBundle, [
  [
    'function Vs(t){const r=q(s=>s.isPremium());return we({',
    'function Vs(t){const r=!0;return we({',
    true
  ],
  [
    'function Qs(t){const r=q(s=>s.isPremium());return we({',
    'function Qs(t){const r=!0;return we({',
    true
  ],
  [
    'function Zs(t){const r=q(s=>s.isPremium());return we({',
    'function Zs(t){const r=!0;return we({',
    true
  ],
  [
    'function ea(t){const r=q(s=>s.isPremium());return we({',
    'function ea(t){const r=!0;return we({',
    true
  ],
  [
    'function aa(t,r="daily"){const s=q(a=>a.isPremium());return we({',
    'function aa(t,r="daily"){const s=!0;return we({',
    true
  ],
  [
    'function ra(t){const r=q(s=>s.isPremium());return we({',
    'function ra(t){const r=!0;return we({',
    true
  ],
  [
    'Ga=t=>e.jsx(ns,{featureName:"Group Details",children:e.jsx(Aa,{...t})})',
    'Ga=t=>e.jsx(Aa,{...t})',
    true
  ],
], 'SingleGroup bundle');

patchFile(useLeaderboardBundle, [
  [
    'function O({period:s,limit:r=50,groupId:t}){const c=k(e=>e.isPremium()),n=s==="daily";',
    'function O({period:s,limit:r=50,groupId:t}){const c=!0,n=s==="daily";',
    true
  ],
  [
    'function U(){const s=k(t=>t.isPremium()),r=k(t=>t.userId);',
    'function U(){const s=!0,r=k(t=>t.userId);',
    true
  ],
], 'useLeaderboard bundle');

// ── 6c. Notification store — native scheduled notifications ─────────────────

console.log('\n=== Patching Notification store bundle ===');
const notificationBundle = findAsset('useNotificationStore-');

patchFile(notificationBundle, [
  [
    [
      '        scheduleNotification: e => {',
      '            const i = `notif-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,',
      '                t = { ...e,',
      '                    id: i',
      '                };',
      '            r(n => ({',
      '                scheduledNotifications: [...n.scheduledNotifications, t]',
      '            }));',
      '            const o = new Date,',
      '                s = new Date(e.scheduledFor).getTime() - o.getTime();',
      '            return s > 0 && setTimeout(() => {',
      '                const n = c();',
      '                n.sendNotification(e.category, e.title, {',
      '                    body: e.body,',
      '                    icon: e.icon || f,',
      '                    badge: e.badge || u,',
      '                    tag: e.tag,',
      '                    requireInteraction: e.requireInteraction,',
      '                    data: e.data',
      '                }), n.cancelNotification(i)',
      '            }, s), i',
      '        },'
    ].join('\n'),
    [
      '        scheduleNotification: e => {',
      '            const i = `notif-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,',
      '                t = { ...e,',
      '                    id: i',
      '                };',
      '            r(n => ({',
      '                scheduledNotifications: [...n.scheduledNotifications, t]',
      '            }));',
      '            const o = new Date,',
      '                s = new Date(e.scheduledFor).getTime() - o.getTime();',
      '            if (typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoScheduleNativeNotification == "function") {',
      '                window.__isoScheduleNativeNotification({',
      '                    id: i,',
      '                    title: e.title,',
      '                    body: e.body || "",',
      '                    at: e.scheduledFor,',
      '                    tag: e.tag,',
      '                    route: e.data && e.data.url || "/focus",',
      '                    data: {',
      '                        ...(e.data || {}),',
      '                        category: e.category,',
      '                        url: e.data && e.data.url || "/focus"',
      '                    }',
      '                }).catch(n => console.error("[NotificationStore] Native schedule failed:", n));',
      '                return i',
      '            }',
      '            return s > 0 && setTimeout(() => {',
      '                const n = c();',
      '                n.sendNotification(e.category, e.title, {',
      '                    body: e.body,',
      '                    icon: e.icon || f,',
      '                    badge: e.badge || u,',
      '                    tag: e.tag,',
      '                    requireInteraction: e.requireInteraction,',
      '                    data: e.data',
      '                }), n.cancelNotification(i)',
      '            }, s), i',
      '        },'
    ].join('\n'),
    true
  ],
  [
    [
      '        cancelNotification: e => {',
      '            r(i => ({',
      '                scheduledNotifications: i.scheduledNotifications.filter(t => t.id !== e)',
      '            }))',
      '        },'
    ].join('\n'),
    [
      '        cancelNotification: e => {',
      '            typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoCancelNativeNotification == "function" && window.__isoCancelNativeNotification(e).catch(() => {});',
      '            r(i => ({',
      '                scheduledNotifications: i.scheduledNotifications.filter(t => t.id !== e)',
      '            }))',
      '        },'
    ].join('\n'),
    true
  ],
  [
    '"serviceWorker" in navigator && navigator.serviceWorker.controller ? await (await navigator.serviceWorker.ready).showNotification(i, d) : typeof Notification < "u" && new Notification(i, d)',
    'typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoScheduleNativeNotification == "function" ? await window.__isoScheduleNativeNotification({title:i,body:d.body||"",at:Date.now()+500,tag:d.tag,route:d.data&&d.data.url||"/focus",data:d.data||{}}) : "serviceWorker" in navigator && navigator.serviceWorker.controller ? await (await navigator.serviceWorker.ready).showNotification(i, d) : typeof Notification < "u" && new Notification(i, d)',
    true
  ],
], 'Notification store bundle');

// ── 7. Focus store — native completion alarm scheduling ─────────────────────

console.log('\n=== Patching Focus store bundle ===');
const focusStoreBundle = findAsset('useFocusStore-');

patchFile(focusStoreBundle, [
  [
    [
      '                questionActionHistory: []',
      '            }), n().persistTimerState()',
      '        },',
      '        pauseTimer:'
    ].join('\n'),
    [
      '                questionActionHistory: []',
      '            }), n().persistTimerState(), typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoScheduleFocusTimer == "function" && s.mode === "pomodoro" && window.__isoScheduleFocusTimer({',
      '                at: Date.now() + Math.max(1, s.timeLeft || s.totalTime || 0) * 1e3,',
      '                title: "Focus session complete",',
      '                body: "Your IsotopeAI focus session is complete."',
      '            }).catch(() => {})',
      '        },',
      '        pauseTimer:'
    ].join('\n'),
    true
  ],
  [
    [
      '                }]',
      '            })), n().persistTimerState()',
      '        },',
      '        resumeTimer:'
    ].join('\n'),
    [
      '                }]',
      '            })), n().persistTimerState(), typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoCancelFocusTimer == "function" && window.__isoCancelFocusTimer().catch(() => {})',
      '        },',
      '        resumeTimer:'
    ].join('\n'),
    true
  ],
  [
    [
      '                    pauseLogs: t',
      '                }',
      '            }), n().persistTimerState()',
      '        },',
      '        resetTimer:'
    ].join('\n'),
    [
      '                    pauseLogs: t',
      '                }',
      '            }), n().persistTimerState();',
      '            const __state = n();',
      '            typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoScheduleFocusTimer == "function" && __state.mode === "pomodoro" && window.__isoScheduleFocusTimer({',
      '                at: Date.now() + Math.max(1, __state.timeLeft || __state.totalTime || 0) * 1e3,',
      '                title: "Focus session complete",',
      '                body: "Your IsotopeAI focus session is complete."',
      '            }).catch(() => {})',
      '        },',
      '        resetTimer:'
    ].join('\n'),
    true
  ],
  [
    [
      '                questionActionHistory: []',
      '            }), S.clearTimerState()',
      '        },',
      '        skipToBreak:'
    ].join('\n'),
    [
      '                questionActionHistory: []',
      '            }), S.clearTimerState(), typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoCancelFocusTimer == "function" && window.__isoCancelFocusTimer().catch(() => {})',
      '        },',
      '        skipToBreak:'
    ].join('\n'),
    true
  ],
  [
    [
      '                questionsBySubject: {},',
      '                questionsByChapter: {}',
      '            }), S.clearTimerState()',
      '        },',
      '        persistTimerState:'
    ].join('\n'),
    [
      '                questionsBySubject: {},',
      '                questionsByChapter: {}',
      '            }), S.clearTimerState(), typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoCancelFocusTimer == "function" && window.__isoCancelFocusTimer().catch(() => {})',
      '        },',
      '        persistTimerState:'
    ].join('\n'),
    true
  ],
  [
    [
      '            if (!i.sessionStartTime || i.activePhase === "break") return null;',
      '            r({',
      '                sessionStartTime: null',
      '            });'
    ].join('\n'),
    [
      '            if (!i.sessionStartTime || i.activePhase === "break") return null;',
      '            typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoCancelFocusTimer == "function" && window.__isoCancelFocusTimer().catch(() => {});',
      '            r({',
      '                sessionStartTime: null',
      '            });'
    ].join('\n'),
    true
  ],
], 'Focus store bundle');

// ── 8. Focus bundle — Android Floating Timer overlay ────────────────────────

console.log('\n=== Patching Focus bundle for Android Floating Timer ===');
const focusBundle = findAsset('Focus-') || path.join(ASSETS_DIR, 'Focus-BmgY-9vP.js');

patchFile(focusBundle, [
  [
    [
      '            Xe = async () => {',
      '                if (!("documentPictureInPicture" in window)) {',
      '                    alert("Picture-in-Picture is not supported in this browser.");',
      '                    return',
      '                }',
      '                try {'
    ].join('\n'),
    [
      '            Xe = async () => {',
      '                if (typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoOpenFloatingTimer == "function") {',
      '                    const __floating = await window.__isoOpenFloatingTimer({',
      '                        route: "/focus",',
      '                        subscribe: __listener => typeof B.subscribe == "function" ? B.subscribe(__listener) : function () {},',
      '                        getState: () => {',
      '                            const Zt = B.getState(),',
      '                                at = Y.getState().profile ?.focusSettings,',
      '                                is = at ?.focusTypes,',
      '                                os = at ?.showQuestionTrackingInTimerPip ?? !0,',
      '                                he = yt(is, Zt.sessionType, Zt.taskType),',
      '                                rt = os && !!he,',
      '                                pe = Zt.mode === "pomodoro" || Zt.activePhase === "break" ? Zt.timeLeft : Zt.stopwatchTime,',
      '                                __now = Date.now(),',
      '                                __completion = (Zt.mode === "pomodoro" || Zt.activePhase === "break") && (Zt.timerState === "running" || Zt.timerState === "break") ? __now + Math.max(0, pe || 0) * 1e3 : null;',
      '                            return {',
      '                                mode: Zt.mode,',
      '                                timerState: Zt.timerState,',
      '                                activePhase: Zt.activePhase,',
      '                                startedAt: Zt.sessionStartTime || null,',
      '                                completionAtMs: __completion,',
      '                                updatedAtMs: __now,',
      '                                displayedSeconds: Math.max(0, pe || 0),',
      '                                totalSeconds: Math.max(0, Zt.totalTime || pe || 0),',
      '                                sessionType: Zt.sessionType || "",',
      '                                taskType: Zt.taskType || "",',
      '                                focusTypeId: he ?.id || Zt.taskType || Zt.sessionType || "other",',
      '                                focusTypeLabel: he ?.label || Zt.taskType || Zt.sessionType || "Focus",',
      '                                focusTypeIcon: he ?.icon || "📌",',
      '                                questionTrackingEnabled: os,',
      '                                trackQuestions: !!he,',
      '                                showQuestionControls: rt,',
      '                                questionsAttempted: Zt.questionsAttempted || 0,',
      '                                questionsCorrect: Zt.questionsCorrect || 0,',
      '                                questionsIncorrect: Zt.questionsIncorrect || 0,',
      '                                questionsSkipped: Zt.questionsSkipped || 0,',
      '                                targetQuestions: Zt.targetQuestions || 0,',
      '                                undoAvailable: !!(Zt.questionActionHistory && Zt.questionActionHistory.length),',
      '                                theme: s ? "dark" : "light",',
      '                                route: "/focus"',
      '                            }',
      '                        },',
      '                        dispatch: __action => {',
      '                            const __state = B.getState(),',
      '                                __type = __action && __action.type || __action;',
      '                            if (__type === "correct" || __type === "incorrect" || __type === "skipped") return __state.recordQuestionResult(__type), !0;',
      '                            if (__type === "undo") return __state.undoLastQuestionResult(), !0;',
      '                            if (__type === "setTarget") return __state.setTargetQuestions(Math.min(9999, Math.max(0, parseInt(__action.value, 10) || 0))), !0;',
      '                            if (__type === "close" || __type === "expand") return !0;',
      '                            return !1',
      '                        }',
      '                    });',
      '                    if (__floating && __floating.ok) return;',
      '                    alert(__floating && __floating.reason || "Floating Timer could not be opened.");',
      '                    return',
      '                } else if (!("documentPictureInPicture" in window)) {',
      '                    alert("Picture-in-Picture is not supported in this browser.");',
      '                    return',
      '                }',
      '                try {'
    ].join('\n'),
    true
  ],
  // Ensure background video doesn't crash without PiP support on Android
  [
    'requestPictureInPicture()',
    '(typeof requestPictureInPicture==="function"?requestPictureInPicture():Promise.reject("no-pip"))',
    false
  ],
], 'Focus bundle Floating Timer');

// ── 8b. Settings bundle — Android font-size control ─────────────────────────

console.log('\n=== Patching Settings bundle ===');
const settingsBundle = findAsset('SettingsLayout-');

patchFile(settingsBundle, [
  [
    [
      '        } = Z(), [g, y] = s.useState("system"), [h, r] = s.useState("#f97316"), [m, b] = s.useState(!1), [f, v] = s.useState("standard"), [l, z] = s.useState("comfortable");',
      '        s.useEffect(() => {',
      '            t && (y(t.settings ?.theme || "system"), r(t.personalization ?.accentColor || "#f97316"), b(t.personalization ?.dyslexiaFont || !1), v(t.settings ?.performanceMode || "standard"), z(t.personalization ?.dashboardLayout || "comfortable"))',
      '        }, [t]), s.useEffect(() => (De(h), () => {'
    ].join('\n'),
    [
      '        } = Z(), [g, y] = s.useState("system"), [h, r] = s.useState("#f97316"), [m, b] = s.useState(!1), [f, v] = s.useState("standard"), [l, z] = s.useState("comfortable"), [P, q] = s.useState(100);',
      '        s.useEffect(() => {',
      '            t && (y(t.settings ?.theme || "system"), r(t.personalization ?.accentColor || "#f97316"), b(t.personalization ?.dyslexiaFont || !1), v(t.settings ?.performanceMode || "standard"), z(t.personalization ?.dashboardLayout || "comfortable"), q(Number(t.personalization ?.fontScale || localStorage.getItem("isotope-font-scale") || 100)))',
      '        }, [t]), s.useEffect(() => (De(h), () => {'
    ].join('\n'),
    true
  ],
  [
    [
      '        }), [h, t ?.personalization ?.accentColor]), s.useEffect(() => (Me(m), () => {',
      '            Me(t ?.personalization ?.dyslexiaFont ?? ut)',
      '        }), [m, t ?.personalization ?.dyslexiaFont]);'
    ].join('\n'),
    [
      '        }), [h, t ?.personalization ?.accentColor]), s.useEffect(() => (Me(m), () => {',
      '            Me(t ?.personalization ?.dyslexiaFont ?? ut)',
      '        }), [m, t ?.personalization ?.dyslexiaFont]), s.useEffect(() => {',
      '            const i = Math.min(120, Math.max(90, Number(P) || 100));',
      '            typeof document < "u" && document.documentElement && (document.documentElement.style.fontSize = `${i}%`);',
      '            try {',
      '                localStorage.setItem("isotope-font-scale", String(i))',
      '            } catch {}',
      '        }, [P]);'
    ].join('\n'),
    true
  ],
  [
    '                    dyslexiaFont: m',
    '                    dyslexiaFont: m,\n                    fontScale: P',
    true
  ],
  [
    [
      '                    }), e.jsx(D, {',
      '                        checked: m,',
      '                        onChange: () => b(!m),',
      '                        ariaLabel: "Dyslexia Friendly Font"',
      '                    })]',
      '                })]'
    ].join('\n'),
    [
      '                    }), e.jsx(D, {',
      '                        checked: m,',
      '                        onChange: () => b(!m),',
      '                        ariaLabel: "Dyslexia Friendly Font"',
      '                    })]',
      '                }), e.jsxs("div", {',
      '                    className: "p-4 rounded-xl bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/5 space-y-3",',
      '                    children: [e.jsxs("div", {',
      '                        className: "flex items-center justify-between gap-4",',
      '                        children: [e.jsxs("div", {',
      '                            children: [e.jsx("h4", {',
      '                                className: "font-bold text-zinc-900 dark:text-white",',
      '                                children: "Font Size"',
      '                            }), e.jsx("p", {',
      '                                className: "text-xs text-zinc-600 dark:text-zinc-300 mt-0.5",',
      '                                children: "Adjust app text scale for this device."',
      '                            })]',
      '                        }), e.jsxs("span", {',
      '                            className: "text-sm font-semibold text-brand-500 tabular-nums",',
      '                            children: [P, "%"]',
      '                        })]',
      '                    }), e.jsx("input", {',
      '                        type: "range",',
      '                        min: "90",',
      '                        max: "120",',
      '                        step: "5",',
      '                        value: P,',
      '                        onChange: i => q(parseInt(i.target.value, 10) || 100),',
      '                        className: "w-full accent-brand-500"',
      '                    })]',
      '                })]'
    ].join('\n'),
    true
  ],
], 'Settings bundle');

// ── 8c. Android render stability and app-only UX patches ───────────────────

console.log('\n=== Patching Android render stability bundles ===');
const indexBundle = findAssetContaining('index-', 'vendor-sentry-VzeXdCeF.js') || findAsset('index-');
const analyticsBundle = findAsset('Analytics-');
const analyticsPeriodBundle = findAsset('AnalyticsPeriod-');
const sessionLogBundle = findAsset('SessionLogTable-');
const dashboardHeaderBundle = findAsset('DashboardHeader-');
const headwayBundle = findAsset('HeadwayUpdatesButton-');

patchFile(indexBundle, [
  [
    [
      '    F = async (e = () => S(() =>',
      '        import ("./vendor-sentry-VzeXdCeF.js"), __vite__mapDeps([0, 1]))) => {',
      '        try {'
    ].join('\n'),
    [
      '    F = async (e = () => S(() =>',
      '        import ("./vendor-sentry-VzeXdCeF.js"), __vite__mapDeps([0, 1]))) => {',
      '        if (typeof window < "u" && window.__ISO_IS_ANDROID__) return !1;',
      '        try {'
    ].join('\n'),
    true
  ],
], 'index bundle Sentry startup');

patchFile(analyticsBundle, [
  [
    'const{isPerformanceMode:s,shouldReduceMotion:i}=yn(),[r,c]=A.useState("Today")',
    'const __androidStable=typeof window<"u"&&window.__ISO_IS_ANDROID__,{isPerformanceMode:__pm,shouldReduceMotion:__rm}=yn(),s=__androidStable||__pm,i=__androidStable||__rm,[r,c]=A.useState("Today")',
    true
  ],
  [
    'Ue=()=>{r==="Weekly"?y(x=>x+1):r==="Monthly"&&v(x=>x+1)},st=()=>{',
    'Ue=()=>{if(Ct())return;r==="Weekly"?y(x=>Math.min(0,x+1)):r==="Monthly"&&v(x=>Math.min(0,x+1))},st=()=>{',
    true
  ],
], 'Analytics bundle Android stability');

patchFile(analyticsPeriodBundle, [
  ['const r=ie(),', 'const r=typeof window<"u"&&window.__ISO_IS_ANDROID__?!1:ie(),', false],
  ['const m=ie();', 'const m=typeof window<"u"&&window.__ISO_IS_ANDROID__?!1:ie();', false],
], 'AnalyticsPeriod chart animation');

patchFile(sessionLogBundle, [
  [
    'children:h.map(t=>e.jsxs(B.tr,{layout:!0,initial:u?!1:{opacity:0},animate:{opacity:1}',
    'children:(typeof window<"u"&&window.__ISO_IS_ANDROID__?h.slice(0,120):h).map(t=>e.jsxs(B.tr,{layout:typeof window<"u"&&window.__ISO_IS_ANDROID__?!1:!0,initial:u||typeof window<"u"&&window.__ISO_IS_ANDROID__?!1:{opacity:0},animate:{opacity:1}',
    true
  ],
], 'SessionLogTable Android row cap');

patchFile(dashboardHeaderBundle, [
  ['window.open("https://isotope.featurebase.app", "_blank")', 'window.open("https://isotopeaiapp.featurebase.app/", "_blank")', false],
  [
    'className: "absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-white dark:bg-[#0e0e11] border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"',
    'className: "fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top)+4.5rem)] w-[min(22rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-6rem)] bg-white dark:bg-[#0e0e11] border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[90]"',
    false
  ],
  [
    'className: "max-h-[min(24rem,calc(100dvh-9rem))] overflow-y-auto"',
    'className: "max-h-[calc(100dvh-12rem)] overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar"',
    false
  ],
], 'DashboardHeader app links and notifications');

patchFile(headwayBundle, [
  ['account: "JRVAXJ"', 'account: "7eeYY7"', true],
  [
    '} : a.persistentStorageGranted === !1 ? {',
    '} : typeof window < "u" && window.__ISO_IS_ANDROID__ ? null : a.persistentStorageGranted === !1 ? {',
    true
  ],
  [
    'a.persistentStorageGranted === !1 && e.jsxs("button", {',
    '!(typeof window < "u" && window.__ISO_IS_ANDROID__) && a.persistentStorageGranted === !1 && e.jsxs("button", {',
    true
  ],
], 'Headway app changelog and Android storage warning');

// ── 9. AndroidManifest.xml — add required permissions ───────────────────────

console.log('\n=== Patching AndroidManifest.xml ===');
const manifestPath = path.join(ANDROID_DIR, 'app', 'src', 'main', 'AndroidManifest.xml');

if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  const permissionsToAdd = [
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
    '    <uses-permission android:name="android.permission.VIBRATE" />',
    '    <uses-permission android:name="android.permission.USE_BIOMETRIC" />',
    '    <uses-permission android:name="android.permission.USE_FINGERPRINT" />',
    '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />',
    '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
    '    <uses-permission android:name="android.permission.WAKE_LOCK" />',
    '    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />',
    '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
    '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />',
    '    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />',
  ];

  const beforePermissionNames = new Set((manifest.match(/<uses-permission\b[^>]*android:name="([^"]+)"/g) || [])
    .map(line => line.match(/android:name="([^"]+)"/)?.[1])
    .filter(Boolean));
  manifest = normalizeManifestPermissions(manifest, permissionsToAdd);
  const afterPermissionNames = new Set((manifest.match(/<uses-permission\b[^>]*android:name="([^"]+)"/g) || [])
    .map(line => line.match(/android:name="([^"]+)"/)?.[1])
    .filter(Boolean));
  let added = 0;
  for (const name of afterPermissionNames) {
    if (!beforePermissionNames.has(name)) added++;
  }

  // Ensure cleartext traffic is disabled (HTTPS only)
  if (!manifest.includes('android:usesCleartextTraffic')) {
    manifest = manifest.replace(
      '<application',
      '<application\n        android:usesCleartextTraffic="false"'
    );
  }

  // Ensure network security config
  if (!manifest.includes('android:networkSecurityConfig')) {
    manifest = manifest.replace(
      '<application',
      '<application\n        android:networkSecurityConfig="@xml/network_security_config"'
    );
  }

  if (!manifest.includes('android:name=".FloatingTimerService"')) {
    const serviceBlock = [
      '        <service',
      '            android:name=".FloatingTimerService"',
      '            android:exported="false"',
      '            android:foregroundServiceType="specialUse">',
      '            <property',
      '                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"',
      '                android:value="interactive_focus_timer_overlay" />',
      '        </service>',
      ''
    ].join('\n');
    manifest = manifest.replace(/\n\s*<provider\b/, '\n' + serviceBlock + '        <provider');
    patchCount++;
  }

  const missingActivityAttributes = [
    ['android:resizeableActivity', 'android:resizeableActivity="true"'],
    ['android:supportsPictureInPicture', 'android:supportsPictureInPicture="true"'],
    ['android:windowSoftInputMode', 'android:windowSoftInputMode="adjustResize"'],
  ].filter(([attrName]) => !manifest.includes(attrName)).map(([, attrLine]) => attrLine);
  if (missingActivityAttributes.length > 0) {
    manifest = manifest.replace(
      'android:exported="true"',
      `android:exported="true"\n            ${missingActivityAttributes.join('\n            ')}`
    );
    patchCount += missingActivityAttributes.length;
  }

  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log(`  ✓ Patched AndroidManifest.xml (added ${added} permissions)`);
  patchCount += added;

  // Create network security config
  const xmlDir = path.join(ANDROID_DIR, 'app', 'src', 'main', 'res', 'xml');
  fs.mkdirSync(xmlDir, { recursive: true });
  const nsConfigPath = path.join(xmlDir, 'network_security_config.xml');
  if (!fs.existsSync(nsConfigPath)) {
    fs.writeFileSync(nsConfigPath, `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">supabase.co</domain>
        <domain includeSubdomains="true">isotope.app</domain>
    </domain-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`, 'utf8');
    console.log('  ✓ Created network_security_config.xml');
    patchCount++;
  }
} else {
  console.log('  SKIP: AndroidManifest.xml not found (run after cap add android)');
  skipCount++;
}

// ── 9b. Android resources — icon and notification contracts ─────────────────

console.log('\n=== Verifying Android native resources ===');
if (fs.existsSync(ANDROID_DIR)) {
  const notificationIconPath = path.join(ANDROID_DIR, 'app', 'src', 'main', 'res', 'drawable', 'ic_notification.xml');
  const mainActivityPath = path.join(ANDROID_DIR, 'app', 'src', 'main', 'java', 'in', 'isotopeai', 'app', 'MainActivity.java');
  const floatingTimerServicePath = path.join(ANDROID_DIR, 'app', 'src', 'main', 'java', 'in', 'isotopeai', 'app', 'FloatingTimerService.java');
  const launcherForegroundPath = path.join(ANDROID_DIR, 'app', 'src', 'main', 'res', 'drawable-v24', 'ic_launcher_foreground.xml');
  const launcherBackgroundPath = path.join(ANDROID_DIR, 'app', 'src', 'main', 'res', 'values', 'ic_launcher_background.xml');

  const resourceChecks = [
    [notificationIconPath, 'ic_notification.xml', /strokeColor="#FFFFFFFF"|fillColor="#FFFFFFFF"/],
    [mainActivityPath, 'MainActivity.java Floating Timer bridge', /startFloatingTimer|requestOverlayPermission|replayFloatingTimerActions/],
    [floatingTimerServicePath, 'FloatingTimerService.java overlay renderer', /TYPE_APPLICATION_OVERLAY|WindowManager|startForeground/],
    [launcherForegroundPath, 'launcher foreground isotope atom', /A78BFA/],
    [launcherBackgroundPath, 'launcher background color', /#111827/],
  ];

  for (const [filePath, label, pattern] of resourceChecks) {
    if (!fs.existsSync(filePath)) {
      console.error(`  ERROR: Missing Android resource: ${label}`);
      failureCount++;
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (!pattern.test(content)) {
      console.error(`  ERROR: Android resource contract failed: ${label}`);
      failureCount++;
      continue;
    }
    console.log(`  ✓ Verified: ${label}`);
  }
} else {
  console.log('  SKIP: Android resources not found');
  skipCount++;
}

// ── 10. Gradle — set correct SDK versions ────────────────────────────────────

console.log('\n=== Patching Gradle SDK versions ===');
const buildGradlePath = path.join(ANDROID_DIR, 'app', 'build.gradle');
const variablesGradlePath = path.join(ANDROID_DIR, 'variables.gradle');

if (fs.existsSync(buildGradlePath)) {
  let gradle = fs.readFileSync(buildGradlePath, 'utf8');

  // Ensure minSdk is 24 (Android 7.0+)
  if (!gradle.includes('minSdkVersion 24') && !gradle.includes('minSdk 24')) {
    const next = gradle
      .replace(/minSdkVersion\s+\d+/, 'minSdkVersion 24')
      .replace(/minSdk\s+=?\s*\d+/, 'minSdk = 24');
    if (next !== gradle) {
      gradle = next;
      console.log('  ✓ Set app/build.gradle minSdkVersion 24');
      patchCount++;
    }
  }

  // Ensure targetSdk is 35
  if (!gradle.includes('targetSdkVersion 35') && !gradle.includes('targetSdk 35')) {
    const next = gradle
      .replace(/targetSdkVersion\s+\d+/, 'targetSdkVersion 35')
      .replace(/targetSdk\s+=?\s*\d+/, 'targetSdk = 35');
    if (next !== gradle) {
      gradle = next;
      console.log('  ✓ Set app/build.gradle targetSdkVersion 35');
      patchCount++;
    }
  }

  fs.writeFileSync(buildGradlePath, gradle, 'utf8');
} else {
  console.log('  SKIP: build.gradle not found (run after cap add android)');
  skipCount++;
}

if (fs.existsSync(variablesGradlePath)) {
  let variables = fs.readFileSync(variablesGradlePath, 'utf8');
  const before = variables;
  variables = variables
    .replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 24')
    .replace(/compileSdkVersion\s*=\s*\d+/, 'compileSdkVersion = 35')
    .replace(/targetSdkVersion\s*=\s*\d+/, 'targetSdkVersion = 35');
  if (variables !== before) {
    fs.writeFileSync(variablesGradlePath, variables, 'utf8');
    console.log('  ✓ Set variables.gradle minSdk=24 compileSdk=35 targetSdk=35');
    patchCount++;
  } else if (
    variables.includes('minSdkVersion = 24') &&
    variables.includes('compileSdkVersion = 35') &&
    variables.includes('targetSdkVersion = 35')
  ) {
    console.log('  ○ variables.gradle SDK versions already correct');
  } else {
    console.error('  ERROR: Could not patch variables.gradle SDK versions');
    failureCount++;
  }
} else if (fs.existsSync(ANDROID_DIR)) {
  console.error('  ERROR: variables.gradle not found in Android project');
  failureCount++;
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`\n╔════════════════════════════════════════╗`);
console.log(`║  Android Patches Applied: ${String(patchCount).padEnd(13)}║`);
console.log(`║  Skipped (not found):     ${String(skipCount).padEnd(13)}║`);
console.log(`╚════════════════════════════════════════╝`);
if (failureCount > 0) {
  console.error(`\nAndroid patches failed: ${failureCount} required patch target(s) were missing or ambiguous.\n`);
  process.exit(1);
}
console.log('\nAndroid patches complete!\n');
