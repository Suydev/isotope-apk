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
    if (content.includes(from)) {
      content = content.split(from).join(to);
      changed = true;
      patchCount++;
    } else if (required) {
      console.warn(`  WARNING: Required patch target not found in ${label}: "${from.slice(0, 80)}..."`);
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

// ── 4. useInvites — fix RPC parameter name ───────────────────────────────────

console.log('\n=== Patching useInvites bundle ===');
const invitesBundle = findAsset('useInvites-') || path.join(ASSETS_DIR, 'useInvites-D9RLFwf8.js');

patchFile(invitesBundle, [
  // rename token_input → p_code for accept_invite and get_invite_details RPCs
  ['"token_input":', '"p_code":', false],
  ['token_input:', 'p_code:', false],
], 'useInvites bundle');

// ── 5. Focus bundle — PIP polyfill (optional, for video PiP) ─────────────────

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

// ── 6. AndroidManifest.xml — add required permissions ───────────────────────

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

  let added = 0;
  for (const perm of permissionsToAdd) {
    const permName = perm.match(/android:name="([^"]+)"/)?.[1];
    if (permName && !manifest.includes(permName)) {
      manifest = manifest.replace('<application', perm + '\n    <application');
      added++;
    }
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

// ── 7. build.gradle — set correct minSdk and targetSdk ───────────────────────

console.log('\n=== Patching build.gradle ===');
const buildGradlePath = path.join(ANDROID_DIR, 'app', 'build.gradle');

if (fs.existsSync(buildGradlePath)) {
  let gradle = fs.readFileSync(buildGradlePath, 'utf8');

  // Ensure minSdk is 24 (Android 7.0+)
  if (!gradle.includes('minSdkVersion 24') && !gradle.includes('minSdk 24')) {
    gradle = gradle
      .replace(/minSdkVersion\s+\d+/, 'minSdkVersion 24')
      .replace(/minSdk\s+=?\s*\d+/, 'minSdk = 24');
    console.log('  ✓ Set minSdkVersion 24');
    patchCount++;
  }

  // Ensure targetSdk is 35
  if (!gradle.includes('targetSdkVersion 35') && !gradle.includes('targetSdk 35')) {
    gradle = gradle
      .replace(/targetSdkVersion\s+\d+/, 'targetSdkVersion 35')
      .replace(/targetSdk\s+=?\s*\d+/, 'targetSdk = 35');
    console.log('  ✓ Set targetSdkVersion 35');
    patchCount++;
  }

  fs.writeFileSync(buildGradlePath, gradle, 'utf8');
} else {
  console.log('  SKIP: build.gradle not found (run after cap add android)');
  skipCount++;
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`\n╔════════════════════════════════════════╗`);
console.log(`║  Android Patches Applied: ${String(patchCount).padEnd(13)}║`);
console.log(`║  Skipped (not found):     ${String(skipCount).padEnd(13)}║`);
console.log(`╚════════════════════════════════════════╝`);
console.log('\nAndroid patches complete!\n');
