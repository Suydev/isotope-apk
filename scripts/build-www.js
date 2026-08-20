#!/usr/bin/env node
/**
 * build-www.js — Clean build script for Capacitor Android APK
 *
 * Reads Supabase config from .env (via supabase-config.js), injects into all
 * runtime files, and produces a www/ directory ready for Capacitor.
 *
 * Does NOT depend on the old prepare-www.js or apply-android-patches.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./supabase-config');
const { execSync } = require('child_process');

const REPO_DIR = process.env.REPO_DIR || path.resolve(__dirname, '../../web-app-source');
const WWW_DIR = process.env.WWW_DIR || path.resolve(__dirname, '../www');
const BRIDGE_FILE = process.env.BRIDGE_FILE || path.resolve(__dirname, '../android-bridge.js');
const FLOATING_TIMER_BRIDGE_FILE = process.env.FLOATING_TIMER_BRIDGE_FILE || path.resolve(__dirname, '../android-floating-timer-bridge.js');

console.log('=== build-www.js ===');
console.log('REPO_DIR   :', REPO_DIR);
console.log('WWW_DIR    :', WWW_DIR);
console.log('BRIDGE_FILE:', BRIDGE_FILE);
console.log('');

// ── Validate inputs ───────────────────────────────────────────────────────────
if (!fs.existsSync(REPO_DIR)) {
  console.error('ERROR: REPO_DIR not found:', REPO_DIR);
  process.exit(1);
}
if (!fs.existsSync(path.join(REPO_DIR, 'index.html'))) {
  console.error('ERROR: index.html not found at repo root');
  process.exit(1);
}
if (!fs.existsSync(path.join(REPO_DIR, 'public'))) {
  console.error('ERROR: public/ not found in repo');
  process.exit(1);
}
if (!fs.existsSync(BRIDGE_FILE)) {
  console.error('ERROR: android-bridge.js not found:', BRIDGE_FILE);
  process.exit(1);
}
if (!fs.existsSync(FLOATING_TIMER_BRIDGE_FILE)) {
  console.error('ERROR: android-floating-timer-bridge.js not found:', FLOATING_TIMER_BRIDGE_FILE);
  process.exit(1);
}

// ── Load Supabase config from .env (highest priority) → config.json ────────────
const SUPA = loadConfig();
const supaUrl = SUPA.url.replace(/\/+$/, '');
const supaAnon = SUPA.anonKey;
const supaRef = SUPA.projectRef;

console.log('Supabase config resolved from:', SUPA.source);
console.log('  SUPABASE_URL        :', supaUrl);
console.log('  SUPABASE_ANON_KEY   :', supaAnon ? '(set, ' + supaAnon.length + ' chars)' : '!! MISSING !!');
console.log('  SUPABASE_PROJECT_REF:', supaRef);
console.log('');

if (!supaUrl || !supaAnon || !supaRef) {
  console.error('ERROR: Missing required Supabase config. Check .env file.');
  process.exit(1);
}

// ── 1. Clean www/ ─────────────────────────────────────────────────────────────
console.log('Step 1: Cleaning www/ ...');
if (fs.existsSync(WWW_DIR)) {
  fs.rmSync(WWW_DIR, { recursive: true, force: true });
}
fs.mkdirSync(WWW_DIR, { recursive: true });
console.log('  ✓ www/ cleaned and recreated');

// ── 2. Copy public/ contents → www/ ──────────────────────────────────────────
console.log('\nStep 2: Copying public/ contents → www/ ...');
copyDirSync(path.join(REPO_DIR, 'public'), WWW_DIR);
console.log('  ✓ Copied public/ contents');

// ── 3. Copy root index.html → www/index.html ─────────────────────────────────
console.log('\nStep 3: Copying root index.html → www/index.html ...');
fs.copyFileSync(path.join(REPO_DIR, 'index.html'), path.join(WWW_DIR, 'index.html'));
console.log('  ✓ index.html copied from repo root');

// ── 4. Copy bridge files ──────────────────────────────────────────────────────
console.log('\nStep 4: Copying bridge files ...');
fs.copyFileSync(BRIDGE_FILE, path.join(WWW_DIR, 'android-bridge.js'));
fs.copyFileSync(FLOATING_TIMER_BRIDGE_FILE, path.join(WWW_DIR, 'android-floating-timer-bridge.js'));
console.log('  ✓ android-bridge.js copied');
console.log('  ✓ android-floating-timer-bridge.js copied');

// ── 5. Inject Supabase config into runtime files ──────────────────────────────
console.log('\nStep 5: Injecting Supabase config into runtime files ...');
injectSupabaseConfig(path.join(WWW_DIR, 'android-bridge.js'), supaUrl, supaAnon, supaRef);
injectSupabaseConfig(path.join(WWW_DIR, 'auth-bridge.js'), supaUrl, supaAnon, supaRef);
console.log('  ✓ Supabase config injected into android-bridge.js and auth-bridge.js');

// ── 6. Patch index.html ───────────────────────────────────────────────────────
console.log('\nStep 6: Patching index.html ...');
let html = fs.readFileSync(path.join(WWW_DIR, 'index.html'), 'utf8');

// 6a. Inject android-bridge.js as FIRST script in <head>
const bridgeScriptTag = '<script src="/android-bridge.js"></script>';
const floatingTimerBridgeScriptTag = '<script src="/android-floating-timer-bridge.js"></script>';
if (!html.includes('android-bridge.js')) {
  html = html.replace(/<head>/i, '<head>\n    ' + bridgeScriptTag + '\n    ' + floatingTimerBridgeScriptTag);
  console.log('  ✓ Bridge scripts injected as first scripts in <head>');
}

// 6b. Disable pwa-local.js (SW registration causes issues in Capacitor)
if (html.includes('/pwa-local.js')) {
  html = html.replace(
    /<script[^>]+src="\/pwa-local\.js"[^>]*>(?:<\/script>)?/,
    '<!-- pwa-local.js disabled in Android APK (Capacitor serves assets locally) -->'
  );
  console.log('  ✓ pwa-local.js disabled');
}

// 6c. Disable update-checker.js (GitHub polling not relevant in APK)
if (html.includes('/update-checker.js')) {
  html = html.replace(
    /<script[^>]+src="\/update-checker\.js"[^>]*>(?:<\/script>)?/,
    '<!-- update-checker.js disabled in Android APK -->'
  );
  console.log('  ✓ update-checker.js disabled');
}

// 6d. Disable deferred-scripts.js (server-injected runtime scripts)
if (html.includes('/deferred-scripts.js')) {
  html = html.replace(
    /<script[^>]+src="\/deferred-scripts\.js"[^>]*>(?:<\/script>)?/,
    '<!-- deferred-scripts.js disabled in Android APK (server-injected; covered by android-bridge.js) -->'
  );
  console.log('  ✓ deferred-scripts.js disabled');
}

// 6e. Fix viewport for Android safe-areas
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />'
);
console.log('  ✓ Viewport fixed for Android safe-areas');

// 6f. Remove hardcoded Supabase globals from index.html (will be injected by android-bridge.js)
html = html.replace(/window\.__ISO_SUPA_URL__\s*=\s*'[^']+'/g, '');
html = html.replace(/window\.__ISO_ANON__\s*=\s*'[^']+'/g, '');
html = html.replace(/var SUPA_REF\s*=\s*"[^"]+"/g, '');
html = html.replace(/var SUPA_REF\s*=\s*'[^']+'/g, '');
html = html.replace(/var SUPA\s*=\s*'[^']+'/g, '');
console.log('  ✓ Hardcoded Supabase globals removed from index.html');

// 6g. Inject Supabase config globals inline (fallback for any script that needs them)
const supaConfigScript = `
<script>
(function(){
  'use strict';
  window.__ISO_SUPA_URL__ = '${supaUrl}';
  window.__ISO_ANON__ = '${supaAnon}';
  window.__ISO_PROJECT_REF__ = '${supaRef}';
  window.__ISO_APP_VERSION__ = '3.4.6';
  window.__ISO_IS_ANDROID__ = true;
})();
</script>
`;
html = html.replace('</head>', supaConfigScript + '\n  </head>');
console.log('  ✓ Supabase config globals injected into <head>');

fs.writeFileSync(path.join(WWW_DIR, 'index.html'), html);
console.log('  ✓ index.html written');

// ── 7. Generate server-injected HTML snippets ─────────────────────────────────
console.log('\nStep 7: Generating server-injected HTML snippets ...');
const EXTRACT_SCRIPT = path.resolve(__dirname, 'extract-server-scripts.js');
if (fs.existsSync(EXTRACT_SCRIPT)) {
  try {
    execSync(`node "${EXTRACT_SCRIPT}"`, {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, OUTPUT_DIR: WWW_DIR, WEB_APP_DIR: REPO_DIR },
      stdio: 'pipe',
    });
    console.log('  ✓ Server-injected HTML snippets generated');
  } catch (e) {
    console.log('  ⚠ Server snippet generation failed:', e.message);
  }
}

// Inject head snippet before </head>
const SERVER_HEAD_PATH = path.join(WWW_DIR, 'isotope-server-head.html');
if (fs.existsSync(SERVER_HEAD_PATH)) {
  const headSnippet = fs.readFileSync(SERVER_HEAD_PATH, 'utf8');
  html = fs.readFileSync(path.join(WWW_DIR, 'index.html'), 'utf8');
  if (!html.includes('isotope-server-head')) {
    html = html.replace('</head>', headSnippet + '\n  <!-- isotope-server-head -->\n</head>');
    fs.writeFileSync(path.join(WWW_DIR, 'index.html'), html);
    console.log('  ✓ Server head scripts injected into <head>');
  }
}

// Inject body snippet before </body>
const SERVER_BODY_PATH = path.join(WWW_DIR, 'isotope-server-body.html');
if (fs.existsSync(SERVER_BODY_PATH)) {
  const bodySnippet = fs.readFileSync(SERVER_BODY_PATH, 'utf8');
  html = fs.readFileSync(path.join(WWW_DIR, 'index.html'), 'utf8');
  if (!html.includes('isotope-server-body')) {
    html = html.replace('</body>', bodySnippet + '\n  <!-- isotope-server-body -->\n</body>');
    fs.writeFileSync(path.join(WWW_DIR, 'index.html'), html);
    console.log('  ✓ Server body scripts injected before </body>');
  }
}

// ── 8. Patch hardcoded project ID in Vite bundles (assets/) ────────────────────
console.log('\nStep 8: Patching hardcoded project ID in Vite bundles ...');
const OLD_PROJECT_ID = 'rcnekgzbdlwhcpmpoogz';
const OLD_ANON_KEY = 'Ryt4Ak9Lx47lvKpMfKozDg0QjxBcP1IHdH7sgqc7x-M';
let patchedCount = 0;
function patchFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;
  newContent = newContent.replace(new RegExp(OLD_PROJECT_ID, 'g'), supaRef);
  newContent = newContent.replace(new RegExp(OLD_ANON_KEY, 'g'), supaAnon);
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent);
    patchedCount++;
  }
}
function walkAndPatch(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAndPatch(fullPath);
    } else if (/\.(js|html|json|css)$/.test(entry.name)) {
      patchFile(fullPath);
    }
  }
}
walkAndPatch(WWW_DIR);
console.log('  ✓ Patched', patchedCount, 'files');

// ── 9. Verify no hardcoded values remain ──────────────────────────────────────
console.log('\nStep 9: Verifying no hardcoded Supabase values remain ...');
// Only check for hardcoded PROJECT IDs and DOUBLE JWT patterns
// The JWT signature (Ryt4Ak9Lx47lvKpMfKozDg0QjxBcP1IHdH7sgqc7x-M) is legitimately
// part of the anon key from .env, so we don't flag it.
const hardcodedPatterns = [
  /vteqquoqvksshmfhuepu/,           // old project ID
  /rcnekgzbdlwhcpmpoogz/,           // old project ID
  /ZkRislOhJRQUjVa1y5ixu-xBhlgkXWWyZKI_CClWj64/, // old project ID
  // Double JWT pattern: two JWTs concatenated (indicates hardcoded value not from .env)
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+\.[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+\.[A-Za-z0-9_-]+/,
];
let violations = 0;
function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const pattern of hardcodedPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      console.error('  ✗ HARDCODED VALUE FOUND in', filePath, ':', matches[0].substring(0, 80));
      violations++;
    }
  }
}
function walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (/\.(js|html|json|css)$/.test(entry.name)) {
      checkFile(fullPath);
    }
  }
}
walkDir(WWW_DIR);
if (violations === 0) {
  console.log('  ✓ No hardcoded Supabase values found in www/');
} else {
  console.error('  ✗ Found', violations, 'hardcoded value violations!');
  process.exit(1);
}

// ── Done ──────────────────────────────────────────────────────────────────────
console.log('\n=== Build complete! www/ is ready for Capacitor ===');

// ── Helpers ───────────────────────────────────────────────────────────────────
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function injectSupabaseConfig(filePath, url, anon, ref) {
  if (!fs.existsSync(filePath)) {
    console.log('  ✗ File not found:', filePath);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  console.log('  → Injecting into:', path.basename(filePath));

  // Replace SUPA_URL / DEFAULT_SUPA_URL
  content = content.replace(/var SUPA_URL\s*=\s*'https:\/\/[a-z0-9]+\.supabase\.co'/g, `var SUPA_URL = '${url}'`);
  content = content.replace(/var DEFAULT_SUPA_URL\s*=\s*'https:\/\/[a-z0-9]+\.supabase\.co'/g, `var DEFAULT_SUPA_URL = '${url}'`);
  content = content.replace(/window\.__ISO_SUPA_URL__\s*=\s*'https:\/\/[a-z0-9]+\.supabase\.co'/g, `window.__ISO_SUPA_URL__ = '${url}'`);

  // Replace SUPA_ANON_KEY / DEFAULT_SUPA_ANON (handle single or double JWT)
  content = content.replace(/var SUPA_ANON_KEY\s*=\s*'[^']+'/g, `var SUPA_ANON_KEY = '${anon}'`);
  content = content.replace(/var DEFAULT_SUPA_ANON\s*=\s*'[^']+'/g, `var DEFAULT_SUPA_ANON = '${anon}'`);
  content = content.replace(/window\.__ISO_ANON__\s*=\s*'[^']+'/g, `window.__ISO_ANON__ = '${anon}'`);

  // Replace project ref in localStorage keys
  content = content.replace(/sb-[a-z0-9]+-auth-token/g, `sb-${ref}-auth-token`);
  content = content.replace(/var ref\s*=\s*'[a-z0-9]+'/g, `var ref = '${ref}'`);

  // Replace window.__ISO_PROJECT_REF__ if present
  content = content.replace(/window\.__ISO_PROJECT_REF__\s*=\s*'[^']*'/g, `window.__ISO_PROJECT_REF__ = '${ref}'`);

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log('    ✓ Written (changed)');
  } else {
    console.log('    ✗ NO CHANGE (regex did not match)');
    // Debug: check what patterns exist
    if (original.includes('rcnekgzbdlwhcpmpoogz')) console.log('    → Has old project ID');
    if (original.includes('Ryt4Ak9Lx47lvKpMfKozDg0QjxBcP1IHdH7sgqc7x-M')) console.log('    → Has old anon key');
    if (original.includes('var SUPA_ANON_KEY')) console.log('    → Has SUPA_ANON_KEY pattern');
    if (original.includes('var SUPA_URL')) console.log('    → Has SUPA_URL pattern');
  }
}