#!/usr/bin/env node
/**
 * prepare-www.js
 * Copies public/ assets from isotope-code into www/ and injects the Android bridge.
 */

const fs   = require('fs');
const path = require('path');

const SOURCE_DIR  = process.env.SOURCE_DIR  || path.resolve(__dirname, '../isotope-code/public');
const WWW_DIR     = process.env.WWW_DIR     || path.resolve(__dirname, '../www');
const BRIDGE_FILE = process.env.BRIDGE_FILE || path.resolve(__dirname, '../android-bridge.js');

if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`ERROR: Source dir not found: ${SOURCE_DIR}`);
  console.error('Set SOURCE_DIR env var or place isotope-code/ next to this repo.');
  process.exit(1);
}

// ── 1. Clean www/ ────────────────────────────────────────────────────────────
console.log('Cleaning www/ ...');
if (fs.existsSync(WWW_DIR)) {
  fs.rmSync(WWW_DIR, { recursive: true, force: true });
}
fs.mkdirSync(WWW_DIR, { recursive: true });

// ── 2. Copy public/ → www/ ───────────────────────────────────────────────────
console.log(`Copying ${SOURCE_DIR} → ${WWW_DIR} ...`);
copyDirSync(SOURCE_DIR, WWW_DIR);
console.log('Copy complete.');

// ── 3. Inject Android bridge into index.html ─────────────────────────────────
const indexPath = path.join(WWW_DIR, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('ERROR: index.html not found in www/');
  process.exit(1);
}

// Copy bridge file
const bridgeDest = path.join(WWW_DIR, 'android-bridge.js');
fs.copyFileSync(BRIDGE_FILE, bridgeDest);
console.log('Bridge copied to www/android-bridge.js');

// Inject bridge script as the FIRST script in <head>
let html = fs.readFileSync(indexPath, 'utf8');

// Add android-bridge BEFORE auth-bridge.js (must be first)
const bridgeTag = '<script src="/android-bridge.js"></script>\n    ';
if (!html.includes('android-bridge.js')) {
  html = html.replace('<head>', '<head>\n    ' + bridgeTag.trimEnd());
}

// Disable service worker in Android context (sw.js causes issues in Capacitor)
// The bridge already intercepts fetch, so SW is redundant and can cause stale-asset loops.
// We comment out pwa-local.js registration and keep the SW file but skip registration.
html = html.replace(
  /(<script src="\/pwa-local\.js"[^>]*>.*?<\/script>)/,
  '<!-- pwa-local.js disabled in Android APK (bridge handles server state) -->'
);

// Replace update-checker (polls GitHub — not needed in APK)
html = html.replace(
  /(<script src="\/update-checker\.js"[^>]*>.*?<\/script>)/,
  '<!-- update-checker.js disabled in Android APK -->'
);

// Fix viewport for Android
html = html.replace(
  'content="width=device-width, initial-scale=1.0"',
  'content="width=device-width, initial-scale=1.0, viewport-fit=cover"'
);

fs.writeFileSync(indexPath, html, 'utf8');
console.log('index.html patched with Android bridge injection.');

// ── 4. Patch sw.js to be a no-op in Capacitor context ────────────────────────
const swPath = path.join(WWW_DIR, 'sw.js');
if (fs.existsSync(swPath)) {
  const swNoop = `/* IsotopeAI service worker — disabled in Capacitor/Android context.
 * All assets are bundled locally; SW cache not needed.
 * Keeping this file to prevent 404s from any registered SW.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => clients.claim());
`;
  fs.writeFileSync(swPath, swNoop, 'utf8');
  console.log('sw.js replaced with no-op (Capacitor bundles assets locally).');
}

// ── 5. Report sizes ──────────────────────────────────────────────────────────
const totalMB = getDirSizeMB(WWW_DIR);
console.log(`\nwww/ total size: ${totalMB.toFixed(1)} MB`);

// Check for large sound files
const soundsDir = path.join(WWW_DIR, 'sounds');
if (fs.existsSync(soundsDir)) {
  const soundFiles = fs.readdirSync(soundsDir);
  soundFiles.forEach(f => {
    const fPath = path.join(soundsDir, f);
    const mb = fs.statSync(fPath).size / 1024 / 1024;
    console.log(`  sounds/${f}: ${mb.toFixed(1)} MB`);
  });
}

console.log('\nwww/ prepared successfully!');

// ── Helpers ──────────────────────────────────────────────────────────────────

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getDirSizeMB(dir) {
  let total = 0;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) {
      total += getDirSizeMB(p) * 1024 * 1024;
    } else {
      total += fs.statSync(p).size;
    }
  }
  return total / 1024 / 1024;
}
