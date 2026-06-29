/**
 * IsotopeAI Android Native Bridge v1.0
 *
 * Intercepts fetch() calls to:
 *   /__auth/*        → Direct Supabase JS client calls
 *   /__supa/*        → Passthrough to Supabase base URL
 *   /api/version     → Local version response
 *   /api/health      → Local health response
 *   /api/ai-config   → Local AI config response
 *   /__isotope/ping  → Local pong response
 *
 * Also disables the server-check loop in pwa-local.js and
 * suppresses "local server unavailable" UI in Android context.
 */
(function () {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────────
  var APP_VERSION    = '3.3.8';
  var SUPA_URL       = 'https://vteqquoqvksshmfhuepu.supabase.co';
  var SUPA_ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0ZXFxdW9xdmtzc2htZmh1ZXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODU2NzUsImV4cCI6MjA5NTY2MTY3NX0.ZkRislOhJRQUjVa1y5ixu-xBhlgkXWWyZKI_CClWj64';

  // ── Android detection ───────────────────────────────────────────────────────
  var isAndroid = (
    typeof window !== 'undefined' &&
    (
      typeof window.Capacitor !== 'undefined' ||
      /Android/i.test(navigator.userAgent) ||
      window.location.protocol === 'capacitor:'
    )
  );

  if (!isAndroid) return; // Only intercept in Capacitor/Android context

  // ── Inject global config so existing scripts see correct values ─────────────
  window.__ISO_SUPA_URL__  = SUPA_URL;
  window.__ISO_ANON__      = SUPA_ANON_KEY;
  window.__ISO_IS_ANDROID__ = true;
  window.__ISO_VERSION__   = APP_VERSION;

  // Signal to pwa-local.js that server is "online" (no node server needed)
  window.__ISO_ANDROID_NATIVE__ = true;

  // ── Helper: read session from localStorage ──────────────────────────────────
  function getSession() {
    try {
      var ref = 'vteqquoqvksshmfhuepu';
      var raw = localStorage.getItem('sb-' + ref + '-auth-token')
             || localStorage.getItem('isotope-auth-token')
             || localStorage.getItem('isotope-last-session-raw');
      if (!raw) return null;
      var s = JSON.parse(raw);
      // Check expiry
      var exp = s.expires_at || 0;
      if (exp && exp < Math.floor(Date.now() / 1000) - 60) {
        // Try to return expired session anyway — Supabase client will refresh
      }
      return s;
    } catch (e) { return null; }
  }

  function getAccessToken() {
    var s = getSession();
    return s && s.access_token ? s.access_token : null;
  }

  // ── Helper: supabase fetch ──────────────────────────────────────────────────
  function supaFetch(path, opts) {
    var token = getAccessToken();
    var headers = Object.assign({}, {
      'apikey': SUPA_ANON_KEY,
      'Authorization': 'Bearer ' + (token || SUPA_ANON_KEY),
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }, opts && opts.headers ? opts.headers : {});
    return fetch(SUPA_URL + path, Object.assign({}, opts, { headers: headers, credentials: 'omit' }));
  }

  // ── Helper: json response ───────────────────────────────────────────────────
  function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function errorResponse(msg, status) {
    return jsonResponse({ ok: false, error: msg }, status || 500);
  }

  // ── Endpoint handlers ───────────────────────────────────────────────────────

  // GET /api/version, /api/health, /api/healthz, /api/status, /__isotope/ping
  function handleLocalStatus(url) {
    var p = new URL(url).pathname;
    if (p === '/__isotope/ping') {
      return Promise.resolve(jsonResponse({ pong: true, android: true }));
    }
    if (p === '/__isotope/state') {
      return Promise.resolve(jsonResponse({ android: true, version: APP_VERSION, serverOnline: true }));
    }
    if (p.startsWith('/api/health') || p === '/api/status') {
      return Promise.resolve(jsonResponse({ status: 'ok', android: true, version: APP_VERSION }));
    }
    if (p === '/api/version') {
      return Promise.resolve(jsonResponse({
        version: APP_VERSION,
        android: true,
        commit: 'local',
        update_available: false
      }));
    }
    if (p === '/api/ai-config') {
      return Promise.resolve(jsonResponse({ enabled: false, android: true }));
    }
    if (p === '/api/community-events') {
      // Return empty events — community still works via Supabase Realtime
      return Promise.resolve(jsonResponse({ events: [], android: true }));
    }
    return null;
  }

  // POST /__auth/login
  function handleLogin(body) {
    return fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: body.username || body.email, password: body.password }),
      credentials: 'omit'
    }).then(function (r) {
      return r.json().then(function (d) {
        if (r.ok && d.access_token) {
          var session = {
            access_token: d.access_token,
            refresh_token: d.refresh_token,
            expires_in: d.expires_in,
            expires_at: Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600),
            token_type: d.token_type || 'bearer',
            user: d.user
          };
          // Write session to localStorage (mirrors what auth-bridge.js does)
          try {
            var raw = JSON.stringify(session);
            var ref = 'vteqquoqvksshmfhuepu';
            localStorage.setItem('isotope-auth-token', raw);
            localStorage.setItem('sb-' + ref + '-auth-token', raw);
            localStorage.setItem('isotope-last-jwt', d.access_token);
            if (d.refresh_token) localStorage.setItem('isotope-last-rt', d.refresh_token);
          } catch (e) {}
          return jsonResponse({ ok: true, session: session, user: d.user });
        } else {
          var errMsg = d.error_description || d.msg || d.message || d.error || 'Login failed';
          return jsonResponse({ ok: false, error: errMsg }, r.status >= 400 ? r.status : 401);
        }
      });
    }).catch(function (e) {
      return errorResponse(e.message || 'Network error during login');
    });
  }

  // POST /__auth/signup
  function handleSignup(body) {
    return fetch(SUPA_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: body.email, password: body.password }),
      credentials: 'omit'
    }).then(function (r) {
      return r.json().then(function (d) {
        if (r.ok) {
          return jsonResponse({ ok: true, data: d, email_confirmation_required: !d.session });
        }
        return jsonResponse({ ok: false, error: d.error_description || d.msg || d.message || 'Signup failed' }, r.status || 400);
      });
    }).catch(function (e) { return errorResponse(e.message); });
  }

  // GET /__auth/bootstrap — check session and load profile
  function handleBootstrap() {
    var session = getSession();
    if (!session || !session.access_token) {
      return Promise.resolve(jsonResponse({
        ok: false, reason: 'no_session', session: null, profile: null,
        user_id: null, onboarding_completed: false,
        restore_recommended: false, best_backup: null,
        backup_candidates: [], backup_warning: null
      }));
    }
    var userId = session.user && session.user.id;
    if (!userId) {
      return Promise.resolve(jsonResponse({
        ok: true, session: session, profile: null, user_id: null,
        onboarding_completed: false, restore_recommended: false,
        best_backup: null, backup_candidates: [], backup_warning: null
      }));
    }

    // Fetch profile AND onboarding status in parallel
    var profilePromise = supaFetch(
      '/rest/v1/user_profiles?select=*&user_id=eq.' + userId + '&limit=1',
      { method: 'GET' }
    );
    var onboardingPromise = supaFetch(
      '/rest/v1/user_onboarding?select=*&user_id=eq.' + userId + '&limit=1',
      { method: 'GET' }
    );

    return Promise.all([profilePromise, onboardingPromise])
      .then(function (results) {
        return Promise.all([results[0].json(), results[1].json()]);
      })
      .then(function (data) {
        var profile = Array.isArray(data[0]) && data[0].length > 0 ? data[0][0] : null;
        var onboardingRow = Array.isArray(data[1]) && data[1].length > 0 ? data[1][0] : null;
        // Treat as onboarded if:
        //   (a) user_onboarding row exists with completed=true, OR
        //   (b) user_onboarding row exists at all (they're an existing user), OR
        //   (c) user_profiles row exists (they've synced data)
        // Only return false for genuinely brand-new accounts with no data at all.
        var onboarding_completed = (onboardingRow !== null) || (profile !== null);
        return jsonResponse({
          ok: true,
          session: session,
          profile: profile,
          user_id: userId,
          onboarding_completed: onboarding_completed,
          restore_recommended: false,
          best_backup: null,
          backup_candidates: [],
          backup_warning: null
        });
      })
      .catch(function () {
        // Network failure during DB fetch — assume onboarded so we don't loop
        return jsonResponse({
          ok: true,
          session: session,
          profile: null,
          user_id: userId,
          onboarding_completed: true,
          restore_recommended: false,
          best_backup: null,
          backup_candidates: [],
          backup_warning: null
        });
      });
  }

  // GET /__auth/profile
  function handleGetProfile() {
    var session = getSession();
    if (!session) return Promise.resolve(jsonResponse({ ok: false, error: 'no_session' }, 401));
    var userId = session.user && session.user.id;
    if (!userId) return Promise.resolve(jsonResponse({ ok: false, error: 'no_user_id' }, 401));

    return supaFetch('/rest/v1/user_profiles?select=*&user_id=eq.' + userId + '&limit=1', { method: 'GET' })
      .then(function (r) {
        return r.json().then(function (rows) {
          var profile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          return jsonResponse({ ok: true, profile_data: profile ? profile.profile_data : null, profile: profile });
        });
      }).catch(function (e) { return errorResponse(e.message); });
  }

  // POST /__auth/profile
  function handlePostProfile(body) {
    var session = getSession();
    if (!session) return Promise.resolve(jsonResponse({ ok: false, error: 'no_session' }, 401));
    var userId = session.user && session.user.id;
    if (!userId) return Promise.resolve(jsonResponse({ ok: false, error: 'no_user_id' }, 401));

    var profileData = body.profile_data || body;
    return supaFetch('/rest/v1/user_profiles?user_id=eq.' + userId, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ profile_data: profileData, updated_at: new Date().toISOString() })
    }).then(function (r) {
      return r.json().then(function (d) {
        if (r.ok) return jsonResponse({ ok: true, profile: Array.isArray(d) ? d[0] : d });
        // Try upsert if no rows updated
        return supaFetch('/rest/v1/user_profiles', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
          body: JSON.stringify({ user_id: userId, profile_data: profileData })
        }).then(function (r2) {
          return r2.json().then(function (d2) {
            return jsonResponse({ ok: r2.ok, profile: Array.isArray(d2) ? d2[0] : d2 });
          });
        });
      });
    }).catch(function (e) { return errorResponse(e.message); });
  }

  // POST /__auth/backup — upload backup JSON to Supabase Storage
  function handleUploadBackup(body) {
    var session = getSession();
    if (!session) return Promise.resolve(jsonResponse({ ok: false, error: 'no_session' }, 401));
    var userId = session.user && session.user.id;
    if (!userId) return Promise.resolve(jsonResponse({ ok: false, error: 'no_user_id' }, 401));

    var backupJson = body.backup_json;
    if (!backupJson) return Promise.resolve(errorResponse('No backup_json provided'));

    var fileName = 'backup-' + Date.now() + '.json';
    var storagePath = userId + '/' + fileName;

    // Upload to Supabase Storage
    return fetch(SUPA_URL + '/storage/v1/object/user-content/' + storagePath, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPA_ANON_KEY,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: typeof backupJson === 'string' ? backupJson : JSON.stringify(backupJson),
      credentials: 'omit'
    }).then(function (r) {
      return r.json().then(function (d) {
        if (r.ok) {
          // Record in backup_manifests
          return supaFetch('/rest/v1/backup_manifests', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({
              user_id: userId,
              file_name: fileName,
              storage_path: storagePath,
              size_bytes: (typeof backupJson === 'string' ? backupJson : JSON.stringify(backupJson)).length,
              created_at: new Date().toISOString()
            })
          }).then(function () {
            return jsonResponse({ ok: true, path: storagePath, file_name: fileName });
          }).catch(function () {
            return jsonResponse({ ok: true, path: storagePath, file_name: fileName });
          });
        }
        return errorResponse(d.error || d.message || 'Upload failed', r.status);
      });
    }).catch(function (e) { return errorResponse(e.message); });
  }

  // GET /__auth/backup/latest
  function handleGetLatestBackup() {
    var session = getSession();
    if (!session) return Promise.resolve(jsonResponse({ ok: false, error: 'no_session' }, 401));
    var userId = session.user && session.user.id;
    if (!userId) return Promise.resolve(jsonResponse({ ok: false, error: 'no_user_id' }, 401));

    return supaFetch('/rest/v1/backup_manifests?select=*&user_id=eq.' + userId + '&order=created_at.desc&limit=1', { method: 'GET' })
      .then(function (r) {
        return r.json().then(function (rows) {
          if (!Array.isArray(rows) || rows.length === 0) {
            return jsonResponse({ ok: true, backup: null, empty: true });
          }
          var manifest = rows[0];
          // Download the file
          return fetch(SUPA_URL + '/storage/v1/object/user-content/' + manifest.storage_path, {
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'apikey': SUPA_ANON_KEY },
            credentials: 'omit'
          }).then(function (fr) {
            return fr.text().then(function (text) {
              return jsonResponse({ ok: true, backup: text, manifest: manifest, size: text.length });
            });
          });
        });
      }).catch(function (e) { return errorResponse(e.message); });
  }

  // GET /__auth/backup/best — find the richest backup
  function handleGetBestBackup() {
    var session = getSession();
    if (!session) return Promise.resolve(jsonResponse({ ok: false, error: 'no_session' }, 401));
    var userId = session.user && session.user.id;
    if (!userId) return Promise.resolve(jsonResponse({ ok: false, error: 'no_user_id' }, 401));

    return supaFetch('/rest/v1/backup_manifests?select=*&user_id=eq.' + userId + '&order=size_bytes.desc,created_at.desc&limit=5', { method: 'GET' })
      .then(function (r) {
        return r.json().then(function (rows) {
          if (!Array.isArray(rows) || rows.length === 0) {
            return jsonResponse({ ok: true, backup: null, empty: true });
          }
          var manifest = rows[0];
          return fetch(SUPA_URL + '/storage/v1/object/user-content/' + manifest.storage_path, {
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'apikey': SUPA_ANON_KEY },
            credentials: 'omit'
          }).then(function (fr) {
            return fr.text().then(function (text) {
              return jsonResponse({ ok: true, backup: text, manifest: manifest, manifests: rows });
            });
          });
        });
      }).catch(function (e) { return errorResponse(e.message); });
  }

  // POST /__auth/logout
  function handleLogout() {
    var session = getSession();
    var token = session && session.access_token;

    // Clear all local auth storage regardless of network outcome
    function clearLocal() {
      try {
        var ref = 'vteqquoqvksshmfhuepu';
        localStorage.removeItem('isotope-auth-token');
        localStorage.removeItem('sb-' + ref + '-auth-token');
        localStorage.removeItem('isotope-last-jwt');
        localStorage.removeItem('isotope-last-rt');
        localStorage.removeItem('isotope-last-session-raw');
      } catch (e) {}
    }

    if (!token) {
      clearLocal();
      return Promise.resolve(jsonResponse({ ok: true, android: true }));
    }

    // Revoke session on Supabase, then clear local
    return fetch(SUPA_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      credentials: 'omit'
    }).then(function () {
      clearLocal();
      return jsonResponse({ ok: true, android: true });
    }).catch(function () {
      clearLocal();
      return jsonResponse({ ok: true, android: true }); // logout succeeds locally even if network fails
    });
  }

  // POST /__auth/import
  function handleImport(body) {
    // Import is handled client-side — just acknowledge
    return Promise.resolve(jsonResponse({ ok: true, imported: true, android: true }));
  }

  // POST /__auth/onboarding-complete — mark onboarding done for the current user
  function handleOnboardingComplete(body) {
    var session = getSession();
    if (!session) return Promise.resolve(jsonResponse({ ok: false, error: 'no_session' }, 401));
    var userId = session.user && session.user.id;
    if (!userId) return Promise.resolve(jsonResponse({ ok: false, error: 'no_user_id' }, 401));

    // Upsert user_onboarding row with completed=true
    return supaFetch('/rest/v1/user_onboarding?user_id=eq.' + userId, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ completed: true, updated_at: new Date().toISOString() })
    }).then(function (r) {
      // If no row to patch (new user), insert one
      if (r.status === 404 || r.status === 200) {
        return supaFetch('/rest/v1/user_onboarding', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
          body: JSON.stringify({ user_id: userId, completed: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        }).then(function () {
          return jsonResponse({ ok: true, android: true });
        });
      }
      return jsonResponse({ ok: true, android: true });
    }).catch(function (e) {
      return errorResponse(e.message);
    });
  }

  // POST /__auth/snapshot
  function handleSnapshot(body) {
    var session = getSession();
    if (!session) return Promise.resolve(jsonResponse({ ok: false, error: 'no_session' }, 401));
    var userId = session.user && session.user.id;
    if (!userId) return Promise.resolve(jsonResponse({ ok: true, android: true }));

    // Update user_settings.last_snapshot_at
    return supaFetch('/rest/v1/user_settings?user_id=eq.' + userId, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ last_snapshot_at: new Date().toISOString() })
    }).then(function () {
      return jsonResponse({ ok: true, android: true, source: body && body.source || 'android' });
    }).catch(function () {
      return jsonResponse({ ok: true, android: true });
    });
  }

  // POST /__auth/restore-best-backup
  function handleRestoreBestBackup(body) {
    return handleGetBestBackup().then(function (resp) {
      return resp.json().then(function (d) {
        return jsonResponse({ ok: d.ok, backup: d.backup, manifest: d.manifest, android: true });
      });
    });
  }

  // /__supa/* — proxy to Supabase directly
  function handleSupaProxy(url, opts, body) {
    var supaPath = url.replace(/^[^/]*\/\/[^/]*/, '').replace(/^\/__supa/, '');
    var token = getAccessToken();
    var headers = Object.assign({}, opts.headers || {}, {
      'apikey': SUPA_ANON_KEY,
      'Authorization': 'Bearer ' + (token || SUPA_ANON_KEY)
    });
    return fetch(SUPA_URL + supaPath, Object.assign({}, opts, {
      headers: headers,
      body: body,
      credentials: 'omit'
    })).catch(function (e) {
      return errorResponse('Supabase proxy error: ' + e.message);
    });
  }

  // ── Main fetch interceptor ──────────────────────────────────────────────────
  var _originalFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
    var method = (init && init.method ? init.method : 'GET').toUpperCase();

    // Resolve relative URLs
    try {
      if (url.startsWith('/') || !url.includes('://')) {
        url = window.location.origin + (url.startsWith('/') ? '' : '/') + url;
      }
    } catch (e) {}

    var pathname;
    try { pathname = new URL(url).pathname; } catch (e) { pathname = url; }

    // ── Local static responses ────────────────────────────────────────────────
    var localResp = handleLocalStatus(url);
    if (localResp) return localResp;

    // ── Server-check from pwa-local.js: suppress and return ok ───────────────
    // pwa-local.js pings /api/version to check if local server is up.
    // In Android mode, always report server as online.
    if (pathname === '/api/version') {
      return Promise.resolve(jsonResponse({ version: APP_VERSION, android: true }));
    }

    // ── Auth routes ───────────────────────────────────────────────────────────
    if (pathname.startsWith('/__auth/') || pathname.startsWith('/__auth')) {
      var bodyPromise;
      if (init && init.body) {
        bodyPromise = Promise.resolve().then(function () {
          try {
            var b = init.body;
            if (typeof b === 'string') return JSON.parse(b);
            return b;
          } catch (e) { return {}; }
        });
      } else {
        bodyPromise = Promise.resolve({});
      }

      return bodyPromise.then(function (body) {
        if (pathname === '/__auth/login') return handleLogin(body);
        if (pathname === '/__auth/signup') return handleSignup(body);
        if (pathname === '/__auth/logout') return handleLogout();
        if (pathname === '/__auth/bootstrap') return handleBootstrap();
        if (pathname === '/__auth/profile') {
          return method === 'POST' ? handlePostProfile(body) : handleGetProfile();
        }
        if (pathname === '/__auth/backup') {
          return method === 'POST' ? handleUploadBackup(body) : handleGetLatestBackup();
        }
        if (pathname === '/__auth/backup/latest') return handleGetLatestBackup();
        if (pathname === '/__auth/backup/best')   return handleGetBestBackup();
        if (pathname === '/__auth/import')              return handleImport(body);
        if (pathname === '/__auth/snapshot')            return handleSnapshot(body);
        if (pathname === '/__auth/restore-best-backup') return handleRestoreBestBackup(body);
        if (pathname === '/__auth/onboarding-complete') return handleOnboardingComplete(body);

        // Unknown auth route — return 404
        return Promise.resolve(jsonResponse({ ok: false, error: 'Unknown auth route: ' + pathname }, 404));
      });
    }

    // ── Supabase proxy (__supa/*) ─────────────────────────────────────────────
    if (pathname.startsWith('/__supa/')) {
      return handleSupaProxy(url, init || {}, init && init.body);
    }

    // ── Avatar proxy  ─────────────────────────────────────────────────────────
    if (pathname.includes('/avatars/') && (url.includes('/__supa/') || !url.includes('://'))) {
      var avatarPath = pathname.replace(/.*\/avatars\//, '');
      return fetch(SUPA_URL + '/storage/v1/object/public/avatars/' + avatarPath, {
        headers: { 'apikey': SUPA_ANON_KEY },
        credentials: 'omit'
      });
    }

    // ── All other requests pass through ──────────────────────────────────────
    return _originalFetch.apply(this, arguments);
  };

  // ── Patch update-checker: suppress GitHub update checks on Android ──────────
  // update-checker.js polls GitHub API — no need on Android APK
  window.__ISO_SUPPRESS_UPDATE_CHECK__ = true;

  // ── Signal to pwa-local.js that there's no local server to check ─────────
  // pwa-local.js checks navigator.onLine + fetch('/api/version')
  // We've intercepted /api/version above, so server check always returns ok.
  // Also override the server-state object if it exists
  setTimeout(function () {
    if (window.__iso_set_server_online) {
      try { window.__iso_set_server_online(true); } catch (e) {}
    }
  }, 100);

  // ── Capacitor-specific setup ──────────────────────────────────────────────
  // Wait for Capacitor to be ready, then set up native integrations
  document.addEventListener('DOMContentLoaded', function () {
    // Adjust viewport for Android safe areas
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    }

    // Apply safe-area padding to body
    var style = document.createElement('style');
    style.textContent = [
      ':root {',
      '  --safe-area-top: env(safe-area-inset-top, 0px);',
      '  --safe-area-bottom: env(safe-area-inset-bottom, 0px);',
      '  --safe-area-left: env(safe-area-inset-left, 0px);',
      '  --safe-area-right: env(safe-area-inset-right, 0px);',
      '}',
      'body {',
      '  padding-top: env(safe-area-inset-top, 0px);',
      '  padding-bottom: env(safe-area-inset-bottom, 0px);',
      '}',
      /* Prevent text selection on long-press (Android default) */
      '.no-select, button, [role="button"] { -webkit-user-select: none; user-select: none; }'
    ].join('\n');
    document.head.appendChild(style);
  });

  // ── Web Notification API polyfill ─────────────────────────────────────────
  // Android WebView does NOT implement window.Notification.
  // The app's useNotificationStore calls Notification.requestPermission() and
  // new Notification(title, {body}) for focus session check-ins.
  // We polyfill window.Notification using Capacitor's LocalNotifications plugin
  // so these calls work natively (real Android system notifications).
  (function setupNotificationPolyfill() {
    // Only run if window.Notification is absent (standard in Android WebView)
    if (typeof window.Notification !== 'undefined') {
      console.log('[IsotopeAI] Web Notification API already present — skipping polyfill');
      return;
    }

    var _permission = 'default';
    var _notifIdCounter = 1000;

    function getLocalNotifications() {
      try {
        return window.Capacitor &&
               window.Capacitor.Plugins &&
               window.Capacitor.Plugins.LocalNotifications || null;
      } catch (e) { return null; }
    }

    // Constructor: new Notification(title, options)
    function IsotopeNotification(title, opts) {
      var body    = (opts && opts.body)  || '';
      var tag     = (opts && opts.tag)   || '';
      var id      = _notifIdCounter++;
      this.title  = title;
      this.body   = body;
      this.tag    = tag;
      this.onclick = null;
      this.onclose = null;
      this.close = function () {};

      if (_permission !== 'granted') return;
      var ln = getLocalNotifications();
      if (!ln) return;

      // Schedule immediately (500 ms delay so Capacitor has time to process)
      ln.schedule({
        notifications: [{
          id: id,
          title: title,
          body: body,
          schedule: { at: new Date(Date.now() + 500) },
          channelId: 'isotope-focus',
          smallIcon: 'ic_launcher',
          iconColor: '#6366f1',
          extra: { tag: tag }
        }]
      }).catch(function (e) {
        console.warn('[IsotopeAI] LocalNotification.schedule failed:', e && e.message);
      });
    }

    IsotopeNotification.permission = _permission;

    IsotopeNotification.requestPermission = function () {
      var ln = getLocalNotifications();
      if (!ln) {
        IsotopeNotification.permission = 'denied';
        _permission = 'denied';
        return Promise.resolve('denied');
      }
      return ln.requestPermissions().then(function (result) {
        var granted = result && result.display === 'granted';
        _permission = granted ? 'granted' : 'denied';
        IsotopeNotification.permission = _permission;
        console.log('[IsotopeAI] Notification permission:', _permission);
        return _permission;
      }).catch(function (e) {
        console.warn('[IsotopeAI] requestPermissions error:', e && e.message);
        _permission = 'denied';
        IsotopeNotification.permission = 'denied';
        return 'denied';
      });
    };

    window.Notification = IsotopeNotification;
    console.log('[IsotopeAI] Web Notification API polyfill installed');

    // ── Create notification channel and check permissions once Capacitor ready ──
    // Capacitor's LocalNotifications requires a channel on Android 8+ (API 26+)
    document.addEventListener('deviceready', function () {
      setupCapacitorNotifications();
    });

    // Capacitor fires 'DOMContentLoaded' is too early; use a short poll instead
    var _capReadyPoll = 0;
    function pollCapacitorReady() {
      _capReadyPoll++;
      var ln = getLocalNotifications();
      if (ln) {
        setupCapacitorNotifications();
        return;
      }
      if (_capReadyPoll < 20) { // Try for up to 2 seconds
        setTimeout(pollCapacitorReady, 100);
      }
    }
    setTimeout(pollCapacitorReady, 300);

    function setupCapacitorNotifications() {
      var ln = getLocalNotifications();
      if (!ln || !ln.createChannel) return;

      // Create the notification channel used by all IsotopeAI alerts
      ln.createChannel({
        id: 'isotope-focus',
        name: 'Focus Sessions',
        description: 'Focus session check-ins and study reminders',
        importance: 4,           // IMPORTANCE_HIGH — shows heads-up
        visibility: 1,           // VISIBILITY_PUBLIC
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#6366F1'
      }).then(function () {
        console.log('[IsotopeAI] Notification channel created: isotope-focus');
      }).catch(function (e) {
        console.warn('[IsotopeAI] createChannel error:', e && e.message);
      });

      // Check current permission state and sync to polyfill
      if (ln.checkPermissions) {
        ln.checkPermissions().then(function (result) {
          if (result && result.display === 'granted') {
            _permission = 'granted';
            IsotopeNotification.permission = 'granted';
            console.log('[IsotopeAI] Notification permission already granted');
          } else if (result && result.display === 'prompt') {
            // Don't auto-request — the app will call requestPermission() when needed
            _permission = 'default';
            IsotopeNotification.permission = 'default';
          } else {
            _permission = 'denied';
            IsotopeNotification.permission = 'denied';
          }
        }).catch(function () {});
      }
    }
  })();

  console.log('[IsotopeAI] Android bridge initialized — version ' + APP_VERSION);
})();
