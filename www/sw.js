/* IsotopeAI sw.js — disabled in Capacitor/Android APK.
 * Capacitor bundles all assets locally; no SW caching needed.
 * This no-op prevents 404s from existing SW registrations.
 * The fetch listener is removed to avoid "no-op handler" warnings on the website.
 */
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(clients.claim()));