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
 * 4. useInvites-D9RLFwf8.js — rename token_input → p_code for accept_invite RPC
 * 5. AndroidManifest.xml — add internet, notification, and file permissions
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
      '                b(__completed ? "/dashboard" : "/onboarding", {',
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

// ── 5. useInvites — fix RPC parameter name ───────────────────────────────────

console.log('\n=== Patching useInvites bundle ===');
const invitesBundle = findAsset('useInvites-') || path.join(ASSETS_DIR, 'useInvites-D9RLFwf8.js');

patchFile(invitesBundle, [
  // rename token_input → p_code for accept_invite and get_invite_details RPCs
  ['"token_input":', '"p_code":', false],
  ['token_input:', 'p_code:', false],
], 'useInvites bundle');

// ── 6. Notification store — native scheduled notifications ──────────────────

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

// ── 8. Focus bundle — PIP polyfill (optional, for video PiP) ─────────────────

console.log('\n=== Patching Focus bundle ===');
const focusBundle = findAsset('Focus-') || path.join(ASSETS_DIR, 'Focus-BmgY-9vP.js');

patchFile(focusBundle, [
  // Ensure background video doesn't crash without PiP support on Android
  [
    'requestPictureInPicture()',
    '(typeof requestPictureInPicture==="function"?requestPictureInPicture():Promise.reject("no-pip"))',
    false
  ],
], 'Focus bundle');

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
    '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
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
