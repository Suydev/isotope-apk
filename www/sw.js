/* IsotopeAI sw.js — disabled in Capacitor/Android APK.
 * Capacitor bundles all assets locally; no SW caching needed.
 * This no-op prevents 404s from existing SW registrations.
 */
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', () => {});