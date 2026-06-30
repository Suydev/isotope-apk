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

  // ── Inject __IK__ global (mirrors server-side injection) ───────────────────
  // The AI store reads window.__IK__.supa / .anon / .gemini / .groq
  // Without this, all AI features are broken on Android.
  window.__IK__ = {
    supa:   SUPA_URL,
    anon:   SUPA_ANON_KEY,
    gemini: '',
    groq:   ''
  };

  // ── Helper: read session from localStorage ──────────────────────────────────
  function getSession() {
    try {
      var ref = 'vteqquoqvksshmfhuepu';
      var raw = localStorage.getItem('sb-' + ref + '-auth-token')
             || localStorage.getItem('isotope-auth-token')
             || localStorage.getItem('isotope-last-session-raw');
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s && s.session && s.session.access_token) s = s.session;
      if (s && s.currentSession && s.currentSession.access_token) s = s.currentSession;
      if (s && s.state && s.state.session && s.state.session.access_token) s = s.state.session;
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

  function safeJsonParse(text, fallback) {
    try { return typeof text === 'string' ? JSON.parse(text) : (text || fallback); }
    catch (e) { return fallback; }
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function compactObject(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (key) {
      if (obj[key] !== undefined) out[key] = obj[key];
    });
    return out;
  }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (text) {
        return { ok: r.ok, status: r.status, body: safeJsonParse(text, text ? { raw: text } : null) };
      });
    });
  }

  function supaJson(path, opts) {
    return supaFetch(path, opts).then(function (r) {
      return r.text().then(function (text) {
        return { ok: r.ok, status: r.status, body: safeJsonParse(text, text ? { raw: text } : null) };
      });
    });
  }

  function firstRow(res) {
    return res && Array.isArray(res.body) && res.body.length ? res.body[0] : null;
  }

  function publicAvatarUrlFromPath(avatarPath) {
    var pathValue = String(avatarPath || '').trim();
    if (!pathValue) return null;
    if (/^https?:\/\//i.test(pathValue)) return pathValue;
    return SUPA_URL + '/storage/v1/object/public/avatars/' + pathValue.split('/').map(encodeURIComponent).join('/');
  }

  function onboardingFromProfileData(profileData) {
    if (!isObject(profileData)) return null;
    if (typeof profileData.isOnboarded === 'boolean') {
      return {
        state: profileData.isOnboarded ? 'completed' : 'incomplete',
        completed: profileData.isOnboarded,
        completed_at: profileData.onboardingCompletedAt || profileData.onboarding_completed_at || null,
        data: isObject(profileData.onboarding) ? profileData.onboarding : {}
      };
    }
    if (typeof profileData.onboarding_completed === 'boolean') {
      return {
        state: profileData.onboarding_completed ? 'completed' : 'incomplete',
        completed: profileData.onboarding_completed,
        completed_at: profileData.onboarding_completed_at || profileData.onboardingCompletedAt || null,
        data: isObject(profileData.onboarding) ? profileData.onboarding : {}
      };
    }
    return null;
  }

  function hasMeaningfulLegacyData(profileData, statsSummary, sessionsLog) {
    if (Array.isArray(sessionsLog) && sessionsLog.length > 0) return true;
    if (statsSummary && (
      Number(statsSummary.total_sessions || 0) > 0 ||
      Number(statsSummary.session_count || 0) > 0 ||
      Number(statsSummary.total_study_seconds || 0) > 0 ||
      Number(statsSummary.total_hours || 0) > 0
    )) return true;
    if (!isObject(profileData)) return false;
    var ignored = {
      settings: true, tours: true, isOnboarded: true, onboarding_completed: true,
      onboardingCompletedAt: true, onboarding_completed_at: true
    };
    return Object.keys(profileData).some(function (key) {
      return !ignored[key] && profileData[key] !== null && profileData[key] !== '' && profileData[key] !== false;
    });
  }

  function normalizeOnboarding(onboardingRow, profileData, legacyCompleted) {
    if (onboardingRow && typeof onboardingRow.completed === 'boolean') {
      return {
        state: onboardingRow.completed ? 'completed' : 'incomplete',
        completed: onboardingRow.completed,
        completed_at: onboardingRow.completed_at || null,
        data: isObject(onboardingRow.data) ? onboardingRow.data : (isObject(profileData && profileData.onboarding) ? profileData.onboarding : {})
      };
    }
    var fromProfile = onboardingFromProfileData(profileData);
    if (fromProfile) return fromProfile;
    if (legacyCompleted === true) {
      return { state: 'completed', completed: true, completed_at: new Date().toISOString(), data: {} };
    }
    return { state: 'incomplete', completed: false, completed_at: null, data: {} };
  }

  function getBackupData(raw) {
    raw = safeJsonParse(raw, raw);
    var source = raw && typeof raw === 'object' ? raw : {};
    var localBackup = isObject(source.local_backup) ? source.local_backup : {};
    var data = isObject(source.data) ? source.data
      : (isObject(source.backup_data) ? source.backup_data
        : (isObject(source.local_collections) ? source.local_collections
          : (isObject(localBackup.data) ? localBackup.data : {})));
    return {
      profile: isObject(data.profile) ? data.profile : (isObject(source.profile_data) ? source.profile_data : null),
      timerState: isObject(data.timerState) ? data.timerState : (isObject(data.timer_state) ? data.timer_state : null),
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      subjects: Array.isArray(data.subjects) ? data.subjects : [],
      habits: Array.isArray(data.habits) ? data.habits : [],
      dailyLogs: Array.isArray(data.dailyLogs) ? data.dailyLogs : [],
      tests: Array.isArray(data.tests) ? data.tests : [],
      exams: Array.isArray(data.exams) ? data.exams : [],
      mockTests: Array.isArray(data.mockTests) ? data.mockTests : []
    };
  }

  function getCollectionCounts(raw) {
    var data = getBackupData(raw);
    return {
      profile: data.profile ? 1 : 0,
      timerState: data.timerState ? 1 : 0,
      tasks: data.tasks.length,
      sessions: data.sessions.length,
      subjects: data.subjects.length,
      habits: data.habits.length,
      dailyLogs: data.dailyLogs.length,
      tests: data.tests.length,
      exams: data.exams.length,
      mockTests: data.mockTests.length
    };
  }

  function isCountsRich(counts, sizeBytes) {
    return ['tasks', 'sessions', 'subjects', 'habits', 'tests', 'exams', 'mockTests'].some(function (key) {
      return Number(counts[key] || 0) > 0;
    }) || (Number(sizeBytes || 0) > 100 * 1024 && ['tasks', 'sessions', 'subjects', 'habits', 'dailyLogs', 'tests', 'exams', 'mockTests'].some(function (key) {
      return Number(counts[key] || 0) > 0;
    }));
  }

  function isCountsEmpty(counts) {
    return ['tasks', 'sessions', 'subjects', 'habits', 'dailyLogs', 'tests', 'exams', 'mockTests'].every(function (key) {
      return Number(counts[key] || 0) === 0;
    }) && Number(counts.timerState || 0) === 0;
  }

  function backupScore(counts, sizeBytes) {
    return (isCountsRich(counts, sizeBytes) ? 100000 : 0)
      + Number(counts.tasks || 0) * 10
      + Number(counts.sessions || 0) * 8
      + Number(counts.subjects || 0) * 10
      + Number(counts.exams || 0) * 8
      + Number(counts.tests || 0) * 8
      + Number(counts.mockTests || 0) * 8
      + Number(counts.habits || 0) * 5
      + Number(counts.dailyLogs || 0) * 2
      + Number(counts.profile || 0)
      + Number(counts.timerState || 0)
      + Math.min(5000, Math.floor(Number(sizeBytes || 0) / 1024));
  }

  function backupExportedAt(raw, meta) {
    raw = safeJsonParse(raw, raw);
    return (raw && (raw.exported_at || raw.exportedAt || (raw.local_backup && raw.local_backup.exportedAt) || raw.downloaded_at))
      || (meta && (meta.updated_at || meta.created_at))
      || null;
  }

  function backupKindFromPath(path) {
    if (path.indexOf('/backups/history/') !== -1) return 'backup_history';
    if (/\/backups\/latest\.json$/.test(path)) return 'backup_latest';
    if (path.indexOf('/cloud-snapshot/history/') !== -1) return 'cloud_snapshot_history';
    if (/\/cloud-snapshot\/latest\.json$/.test(path)) return 'cloud_snapshot_latest';
    if (path.indexOf('/imports/') !== -1) return /\/latest\.json$/.test(path) ? 'import_latest' : 'import_archive';
    if (path.indexOf('/exports/') !== -1) return /\/latest\.json$/.test(path) ? 'export_latest' : 'export_archive';
    return 'unknown';
  }

  function buildBackupCandidate(userId, path, text, meta) {
    var counts = getCollectionCounts(text);
    var size = text ? text.length : Number(meta && (meta.size_bytes || meta.size || 0)) || 0;
    var rich = isCountsRich(counts, size);
    var empty = isCountsEmpty(counts);
    return {
      bucket: 'user-content',
      path: path,
      exists: !!text,
      valid: !!text,
      kind: backupKindFromPath(path),
      size_bytes: size,
      exported_at: backupExportedAt(text, meta),
      updated_at: meta && (meta.updated_at || meta.created_at) || null,
      collection_counts: counts,
      rich_score: backupScore(counts, size),
      rich: rich,
      empty: empty,
      reason: rich ? 'rich backup' : (empty ? 'profile-only or empty backup' : 'valid sparse backup')
    };
  }

  function storageDownloadText(userId, objectPath) {
    var session = getSession();
    if (!session || !session.access_token) return Promise.resolve(null);
    return fetch(SUPA_URL + '/storage/v1/object/user-content/' + objectPath, {
      headers: { 'Authorization': 'Bearer ' + session.access_token, 'apikey': SUPA_ANON_KEY },
      credentials: 'omit'
    }).then(function (r) {
      if (!r.ok) return null;
      return r.text();
    }).catch(function () { return null; });
  }

  function storageList(prefix) {
    var session = getSession();
    if (!session || !session.access_token) return Promise.resolve([]);
    return fetch(SUPA_URL + '/storage/v1/object/list/user-content', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPA_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefix: prefix || '', limit: 20, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
      credentials: 'omit'
    }).then(function (r) {
      if (!r.ok) return [];
      return r.json().catch(function () { return []; });
    }).catch(function () { return []; });
  }

  function compareBackupCandidate(a, b) {
    if (a.rich !== b.rich) return a.rich ? -1 : 1;
    var at = new Date(a.exported_at || a.updated_at || 0).getTime() || 0;
    var bt = new Date(b.exported_at || b.updated_at || 0).getTime() || 0;
    if (bt !== at) return bt - at;
    return Number(b.rich_score || 0) - Number(a.rich_score || 0);
  }

  function publicBackupCandidate(candidate) {
    return candidate ? Object.assign({}, candidate) : null;
  }

  function findBestCloudBackup(userId) {
    var basePaths = [
      userId + '/backups/latest.json',
      userId + '/cloud-snapshot/latest.json',
      userId + '/imports/latest.json',
      userId + '/exports/latest.json'
    ];
    var historyPrefixes = [
      userId + '/backups/history/',
      userId + '/imports/',
      userId + '/exports/',
      userId + '/cloud-snapshot/history/'
    ];
    return Promise.all(historyPrefixes.map(storageList)).then(function (lists) {
      var seen = {};
      var metas = basePaths.map(function (path) { return { path: path }; });
      lists.forEach(function (files, idx) {
        var prefix = historyPrefixes[idx];
        (Array.isArray(files) ? files : []).slice(0, 20).forEach(function (file) {
          if (!file || !file.name || file.name === 'history') return;
          var path = prefix + file.name;
          metas.push({ path: path, updated_at: file.updated_at || file.created_at || null, size_bytes: file.metadata && file.metadata.size || file.size || null });
        });
      });
      metas = metas.filter(function (meta) {
        if (!meta.path || seen[meta.path] || !/\.json$/.test(meta.path)) return false;
        seen[meta.path] = true;
        return true;
      });
      return Promise.all(metas.map(function (meta) {
        return storageDownloadText(userId, meta.path).then(function (text) {
          return text ? buildBackupCandidate(userId, meta.path, text, meta) : null;
        });
      }));
    }).then(function (candidates) {
      var valid = candidates.filter(Boolean).sort(compareBackupCandidate);
      var selected = valid[0] || null;
      var emptyLatest = valid.find(function (candidate) {
        return candidate.empty && (/\/backups\/latest\.json$/.test(candidate.path) || /\/exports\/latest\.json$/.test(candidate.path) || /\/cloud-snapshot\/latest\.json$/.test(candidate.path));
      });
      var richLegacy = valid.find(function (candidate) {
        return candidate.rich && (candidate.path.indexOf('/imports/') !== -1 || candidate.path.indexOf('/exports/') !== -1 || candidate.path.indexOf('/cloud-snapshot/') !== -1);
      });
      return {
        ok: true,
        selected: publicBackupCandidate(selected),
        candidates: valid.map(publicBackupCandidate),
        local_recommendation: selected && selected.rich ? 'restore_or_merge_before_upload' : (selected ? 'cloud_empty_upload_allowed_if_local_rich' : 'upload_local_if_rich'),
        warning_if_empty_latest: emptyLatest && richLegacy && richLegacy.path !== emptyLatest.path
          ? 'A latest backup is empty/profile-only while a richer backup exists. Do not upload empty local data.'
          : null
      };
    });
  }

  function downloadCloudSnapshot(userId) {
    return storageDownloadText(userId, userId + '/cloud-snapshot/latest.json').then(function (text) {
      var parsed = safeJsonParse(text, null);
      return parsed && parsed.user_id === userId ? parsed : null;
    });
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

  // POST /__auth/check — neutral preflight only. Never probe signup.
  function handleCheck(body) {
    var email = body.email || body.username || '';
    return Promise.resolve(jsonResponse({
      ok: true,
      available: true,
      neutral: true,
      checked: false,
      email: email || null
    }));
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
        ok: false, reason: 'no_session', session: null, user: null, profile: null,
        user_id: null, onboarding: { state: 'unknown' }, onboarding_completed: undefined,
        restore_recommended: false, best_backup: null, cloud_snapshot: null,
        backup_candidates: [], backup_warning: null
      }, 401));
    }
    var userId = session.user && session.user.id;
    if (!userId) {
      return Promise.resolve(jsonResponse({ ok: false, error: 'no_user_id', session: session, user_id: null }, 401));
    }

    var since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    var fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    var profilePromise = supaJson('/rest/v1/user_profiles?select=profile_data,updated_at&user_id=eq.' + encodeURIComponent(userId) + '&limit=1', { method: 'GET' });
    var userPromise = supaJson('/rest/v1/users?select=username,name,avatar_url,coins,gems,plan_type,email&id=eq.' + encodeURIComponent(userId) + '&limit=1', { method: 'GET' });
    var onboardingPromise = supaJson('/rest/v1/user_onboarding?select=completed,completed_at,data&user_id=eq.' + encodeURIComponent(userId) + '&limit=1', { method: 'GET' });
    var settingsPromise = supaJson('/rest/v1/user_settings?select=settings,updated_at&user_id=eq.' + encodeURIComponent(userId) + '&limit=1', { method: 'GET' }).catch(function (e) { return { ok: false, status: 0, body: { error: e.message } }; });
    var statsPromise = supaJson('/rest/v1/user_stats_summary?select=*&user_id=eq.' + encodeURIComponent(userId) + '&limit=1', { method: 'GET' }).catch(function (e) { return { ok: false, status: 0, body: { error: e.message } }; });
    var dailyPromise = supaJson('/rest/v1/daily_user_stats?select=date,seconds_studied&user_id=eq.' + encodeURIComponent(userId) + '&date=gte.' + encodeURIComponent(fromDate) + '&order=date.desc&limit=120', { method: 'GET' }).catch(function (e) { return { ok: false, status: 0, body: { error: e.message } }; });
    var sessionsPromise = supaJson('/rest/v1/study_sessions_log?select=id,duration_minutes,ended_at,created_at&user_id=eq.' + encodeURIComponent(userId) + '&ended_at=gte.' + encodeURIComponent(since) + '&order=ended_at.desc&limit=250', { method: 'GET' }).catch(function (e) { return { ok: false, status: 0, body: { error: e.message } }; });

    return Promise.all([
      profilePromise, userPromise, onboardingPromise,
      settingsPromise, statsPromise, dailyPromise, sessionsPromise,
      downloadCloudSnapshot(userId).catch(function () { return null; }),
      findBestCloudBackup(userId).catch(function (e) {
        return { ok: false, selected: null, candidates: [], error: e.message || 'Best backup scan failed' };
      })
    ]).then(function (results) {
        var profileRes = results[0];
        var userRes = results[1];
        var onboardingRes = results[2];
        if (!profileRes.ok || !userRes.ok || !onboardingRes.ok) {
          return jsonResponse({
            ok: false,
            error: 'bootstrap_db_unavailable',
            user_id: userId,
            session: session,
            onboarding: { state: 'unknown' },
            onboarding_completed: undefined
          }, 503);
        }
        var profileRow = firstRow(profileRes);
        var userRow = firstRow(userRes) || (session.user || {});
        var onboardingRow = firstRow(onboardingRes);
        var settingsRow = firstRow(results[3]);
        var statsSummary = firstRow(results[4]);
        var dailyRows = Array.isArray(results[5].body) ? results[5].body : [];
        var sessionRows = Array.isArray(results[6].body) ? results[6].body : [];
        var cloudSnapshot = results[7] || null;
        var bestBackup = results[8] || { selected: null, candidates: [] };
        var profileData = isObject(profileRow && profileRow.profile_data) ? profileRow.profile_data : {};
        var legacyMeaningful = !onboardingRow && hasMeaningfulLegacyData(profileData, statsSummary, sessionRows);
        var onboarding = normalizeOnboarding(onboardingRow, profileData, legacyMeaningful);
        if (!onboardingRow && legacyMeaningful) {
          supaJson('/rest/v1/user_onboarding?on_conflict=user_id', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
              user_id: userId,
              completed: true,
              completed_at: onboarding.completed_at || new Date().toISOString(),
              data: onboarding.data || {},
              source: 'android_legacy_migration',
              updated_at: new Date().toISOString()
            })
          }).catch(function () {});
        }
        var avatarPath = profileData.avatar_path || profileData.avatarPath || null;
        var avatarUrl = [
          profileData.avatar,
          profileData.avatar_url,
          profileData.avatarUrl,
          userRow.avatar_url,
          publicAvatarUrlFromPath(avatarPath)
        ].find(function (value) { return typeof value === 'string' && value.trim(); }) || null;
        var rawProfileData = Object.assign({}, profileData);
        if (avatarUrl) {
          rawProfileData.avatar = rawProfileData.avatar || avatarUrl;
          rawProfileData.avatar_url = rawProfileData.avatar_url || avatarUrl;
        }
        if (avatarPath) rawProfileData.avatar_path = avatarPath;
        var normalizedProfile = Object.assign({}, userRow || {}, rawProfileData, compactObject({
          avatar: avatarUrl || undefined,
          avatar_url: avatarUrl || undefined,
          isOnboarded: onboarding.completed,
          onboarding_completed: onboarding.completed,
          onboarding_completed_at: onboarding.completed_at || rawProfileData.onboardingCompletedAt || null
        }));
        var settings = isObject(settingsRow && settingsRow.settings) ? settingsRow.settings : (isObject(rawProfileData.settings) ? rawProfileData.settings : {});
        var tours = isObject(rawProfileData.tours) ? rawProfileData.tours : {};
        return jsonResponse({
          ok: true,
          code: 'BOOTSTRAP_OK',
          user_id: userId,
          session: session,
          user: userRow || null,
          profile: normalizedProfile,
          profile_data: rawProfileData,
          profile_updated_at: profileRow && profileRow.updated_at || null,
          onboarding: onboarding,
          onboarding_completed: onboarding.completed,
          settings: settings,
          tours: tours,
          stats_summary: statsSummary || null,
          daily_user_stats: dailyRows,
          study_sessions_log: sessionRows,
          cloud_snapshot: cloudSnapshot,
          best_backup: bestBackup.selected || null,
          backup_candidates: bestBackup.candidates || [],
          restore_recommended: !!(bestBackup.selected && bestBackup.selected.rich),
          backup_warning: bestBackup.warning_if_empty_latest || bestBackup.error || null,
          fetched_at: new Date().toISOString()
        });
      })
      .catch(function (e) {
        // Network failure during DB fetch — preserve local state and let boot use cached snapshots/retry.
        return jsonResponse({
          ok: false,
          error: e && e.message || 'bootstrap_failed',
          session: session,
          profile: null,
          user_id: userId,
          onboarding: { state: 'unknown' },
          onboarding_completed: undefined,
          best_backup: null,
          backup_candidates: [],
          backup_warning: null
        }, 503);
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

    var now = new Date().toISOString();
    var onboardingData = body && (body.data || body.onboarding_data || body.onboarding);
    return supaJson('/rest/v1/user_onboarding?on_conflict=user_id', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        user_id: userId,
        completed: true,
        completed_at: now,
        data: isObject(onboardingData) ? onboardingData : {},
        updated_at: now
      })
    }).then(function (result) {
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.body && (result.body.message || result.body.error) || 'Onboarding upsert failed' }, result.status || 500);
      }
      var row = Array.isArray(result.body) ? result.body[0] : result.body;
      if (!row || row.completed !== true) {
        return jsonResponse({ ok: false, error: 'Onboarding completion was not persisted' }, 500);
      }
      return jsonResponse({ ok: true, android: true, onboarding: row, onboarding_completed: true });
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

  // ── Edge function interceptors (mirrors server-side /__supa/functions/v1/* logic) ─
  // The server normally intercepts these before they hit Supabase edge functions.
  // On Android we must handle them in the bridge.

  // POST /__supa/functions/v1/finish-session — calls finish_session_sync RPC
  function handleFinishSession(body) {
    var session = getSession();
    if (!session) return Promise.resolve(jsonResponse({ ok: false, error: 'no_session' }, 401));
    // Call finish_session_sync RPC with the user's JWT (required — RPC uses auth.uid())
    return fetch(SUPA_URL + '/rest/v1/rpc/finish_session_sync', {
      method: 'POST',
      headers: {
        'apikey': SUPA_ANON_KEY,
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {}),
      credentials: 'omit'
    }).then(function (r) {
      return r.json().then(function (d) {
        return jsonResponse({ ok: r.ok, data: d });
      });
    }).catch(function (e) {
      return errorResponse(e.message);
    });
  }

  // GET /__supa/functions/v1/get-leaderboard — live leaderboard from DB
  function handleGetLeaderboard(searchParams) {
    var session = getSession();
    var token = session ? session.access_token : SUPA_ANON_KEY;
    var limit = searchParams.get ? (searchParams.get('limit') || '50') : '50';
    return fetch(SUPA_URL + '/rest/v1/rpc/get_leaderboard?limit=' + limit, {
      method: 'POST',
      headers: {
        'apikey': SUPA_ANON_KEY,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_limit: parseInt(limit, 10) || 50 }),
      credentials: 'omit'
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) return jsonResponse({ ok: false, error: d && (d.message || d.error) || 'Leaderboard RPC failed', data: [] }, r.status || 500);
        return jsonResponse({ ok: true, data: Array.isArray(d) ? d : [], android: true });
      });
    }).catch(function () {
      return jsonResponse({ ok: false, error: 'Leaderboard RPC failed', data: [], android: true }, 503);
    });
  }

  // GET /__supa/functions/v1/get-daily-leaderboard
  function handleGetDailyLeaderboard(searchParams) {
    var session = getSession();
    var token = session ? session.access_token : SUPA_ANON_KEY;
    return fetch(SUPA_URL + '/rest/v1/rpc/get_daily_leaderboard', {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'omit'
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) return jsonResponse({ ok: false, error: d && (d.message || d.error) || 'Daily leaderboard RPC failed', data: [] }, r.status || 500);
        return jsonResponse({ ok: true, data: Array.isArray(d) ? d : [], android: true });
      });
    }).catch(function () {
      return jsonResponse({ ok: false, error: 'Daily leaderboard RPC failed', data: [], android: true }, 503);
    });
  }

  // POST /__supa/functions/v1/get-group-leaderboard
  function handleGetGroupLeaderboard(body) {
    var session = getSession();
    var token = session ? session.access_token : SUPA_ANON_KEY;
    return fetch(SUPA_URL + '/rest/v1/rpc/get_group_leaderboard', {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      credentials: 'omit'
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) return jsonResponse({ ok: false, error: d && (d.message || d.error) || 'Group leaderboard RPC failed', data: [] }, r.status || 500);
        return jsonResponse({ ok: true, data: Array.isArray(d) ? d : [], android: true });
      });
    }).catch(function () {
      return jsonResponse({ ok: false, error: 'Group leaderboard RPC failed', data: [], android: true }, 503);
    });
  }

  // POST /__supa/functions/v1/get-group-analytics
  function handleGetGroupAnalytics(body) {
    var session = getSession();
    var token = session ? session.access_token : SUPA_ANON_KEY;
    return fetch(SUPA_URL + '/rest/v1/rpc/get_group_analytics_from_snapshots', {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      credentials: 'omit'
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) return jsonResponse({ ok: false, error: d && (d.message || d.error) || 'Group analytics RPC failed', data: null }, r.status || 500);
        return jsonResponse({ ok: true, data: d, android: true });
      });
    }).catch(function () {
      return jsonResponse({ ok: false, error: 'Group analytics RPC failed', data: null, android: true }, 503);
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
        if (pathname === '/__auth/check')  return handleCheck(body);
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

    // ── Edge function interceptors (__supa/functions/v1/*) ───────────────────
    // These mirror what the server-side proxy intercepts before hitting Supabase.
    if (pathname.startsWith('/__supa/functions/v1/')) {
      var fnName = pathname.replace('/__supa/functions/v1/', '').split('?')[0];
      var bodyPromiseEF;
      if (init && init.body) {
        bodyPromiseEF = Promise.resolve().then(function () {
          try { var b = init.body; return typeof b === 'string' ? JSON.parse(b) : b; }
          catch (e) { return {}; }
        });
      } else {
        bodyPromiseEF = Promise.resolve({});
      }
      var searchParamsEF;
      try { searchParamsEF = new URL(url).searchParams; } catch (e) { searchParamsEF = { get: function() { return null; } }; }

      return bodyPromiseEF.then(function (efBody) {
        // Payments — always disabled in self-hosted mode
        if (fnName === 'create_checkout' || fnName === 'create-checkout') {
          return jsonResponse({ url: null, disabled: true, android: true });
        }
        if (fnName === 'create_customer_portal_session' || fnName === 'create-customer-portal-session') {
          return jsonResponse({ url: null, disabled: true, android: true });
        }
        // Membership redemption — always grant ranker in self-hosted mode
        if (fnName === 'redeem_membership_code' || fnName === 'redeem-membership-code') {
          return jsonResponse({ success: true, redeemed: true, plan_type: 'ranker', android: true });
        }
        // Focus session sync — calls finish_session_sync RPC with user JWT
        if (fnName === 'finish-session' || fnName === 'finish_session') {
          return handleFinishSession(efBody);
        }
        // Leaderboards
        if (fnName === 'get-leaderboard' || fnName === 'get_leaderboard') {
          return handleGetLeaderboard(searchParamsEF);
        }
        if (fnName === 'get-daily-leaderboard' || fnName === 'get_daily_leaderboard') {
          return handleGetDailyLeaderboard(searchParamsEF);
        }
        if (fnName === 'get-group-leaderboard' || fnName === 'get_group_leaderboard') {
          return handleGetGroupLeaderboard(efBody);
        }
        if (fnName === 'get-group-analytics' || fnName === 'get_group_analytics') {
          return handleGetGroupAnalytics(efBody);
        }
        // Unknown edge function — fall through to proxy
        return handleSupaProxy(url, init || {}, init && init.body);
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

  // ── Expose auth globals required by auth-bridge.js ───────────────────────
  // auth-bridge.js defines window.__isoLogin and window.__isoUp as entry points.
  // On Android these must call our bridge handlers directly.
  window.__isoLogin = function (email, password) {
    return handleLogin({ email: email, password: password }).then(function (r) {
      return r.json();
    });
  };
  window.__isoUp = function (email, password) {
    return handleSignup({ email: email, password: password }).then(function (r) {
      return r.json();
    });
  };
  window.__isoGetValidJwt = function () {
    return getAccessToken();
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
    var _nativeListenerInstalled = false;
    var _nativeChannelReady = false;

    function getLocalNotifications() {
      try {
        return window.Capacitor &&
               window.Capacitor.Plugins &&
               window.Capacitor.Plugins.LocalNotifications || null;
      } catch (e) { return null; }
    }

    function nativeNotificationId(id) {
      if (typeof id === 'number' && Number.isFinite(id)) return Math.max(1, Math.floor(id));
      var s = String(id || 'isotope-notification');
      var hash = 0;
      for (var i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
      return Math.abs(hash % 1000000000) + 1;
    }

    function installNativeNotificationTapHandler(ln) {
      if (_nativeListenerInstalled || !ln || typeof ln.addListener !== 'function') return;
      _nativeListenerInstalled = true;
      try {
        ln.addListener('localNotificationActionPerformed', function (event) {
          var extra = event && event.notification && event.notification.extra || {};
          var route = extra.route || extra.url || extra.data && extra.data.url || '/focus';
          try {
            if (route && typeof route === 'string') {
              window.history.pushState(null, '', route.charAt(0) === '/' ? route : '/' + route);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          } catch (e) {
            window.location.href = route || '/focus';
          }
        });
      } catch (e) {
        console.warn('[IsotopeAI] notification tap listener failed:', e && e.message);
      }
    }

    function createNativeNotificationChannel(ln) {
      if (!ln || !ln.createChannel) return Promise.resolve(false);
      installNativeNotificationTapHandler(ln);
      if (_nativeChannelReady) return Promise.resolve(true);
      return ln.createChannel({
        id: 'isotope-focus',
        name: 'Focus Sessions',
        description: 'Focus session completion and study reminders',
        importance: 4,
        visibility: 1,
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#6366F1'
      }).then(function () {
        _nativeChannelReady = true;
        console.log('[IsotopeAI] Notification channel created: isotope-focus');
        return true;
      }).catch(function (e) {
        console.warn('[IsotopeAI] createChannel error:', e && e.message);
        return false;
      });
    }

    window.__isoEnsureNotificationPermission = function (opts) {
      var ln = getLocalNotifications();
      opts = opts || {};
      if (!ln) {
        _permission = 'denied';
        IsotopeNotification.permission = 'denied';
        return Promise.resolve({ ok: false, permission: 'denied', reason: 'LocalNotifications unavailable' });
      }
      return createNativeNotificationChannel(ln).then(function () {
        if (!ln.checkPermissions) return { display: 'prompt' };
        return ln.checkPermissions();
      }).then(function (result) {
        if (result && result.display === 'granted') {
          _permission = 'granted';
          IsotopeNotification.permission = 'granted';
          return { ok: true, permission: 'granted' };
        }
        if (opts.request === false || !ln.requestPermissions) {
          _permission = result && result.display === 'denied' ? 'denied' : 'default';
          IsotopeNotification.permission = _permission;
          return { ok: false, permission: _permission };
        }
        return ln.requestPermissions().then(function (requested) {
          var granted = requested && requested.display === 'granted';
          _permission = granted ? 'granted' : 'denied';
          IsotopeNotification.permission = _permission;
          return { ok: granted, permission: _permission };
        });
      }).catch(function (e) {
        _permission = 'denied';
        IsotopeNotification.permission = 'denied';
        return { ok: false, permission: 'denied', reason: e && e.message };
      });
    };

    window.__isoScheduleNativeNotification = function (payload) {
      var ln = getLocalNotifications();
      if (!ln || !ln.schedule) return Promise.resolve({ ok: false, reason: 'LocalNotifications unavailable' });
      payload = payload || {};
      var at = payload.at || payload.scheduledFor || Date.now();
      var when = at instanceof Date ? at : new Date(at);
      if (Number.isNaN(when.getTime())) when = new Date(Date.now() + 500);
      if (when.getTime() < Date.now() + 250) when = new Date(Date.now() + 500);
      var data = payload.data || {};
      return window.__isoEnsureNotificationPermission({ request: payload.requestPermission !== false }).then(function (permission) {
        if (!permission.ok) return permission;
        var numericId = nativeNotificationId(payload.id || payload.tag || payload.title || Date.now());
        return ln.schedule({
          notifications: [{
            id: numericId,
            title: payload.title || 'IsotopeAI',
            body: payload.body || '',
            schedule: { at: when },
            channelId: payload.channelId || 'isotope-focus',
            smallIcon: 'ic_launcher',
            iconColor: payload.iconColor || '#6366f1',
            extra: {
              notificationId: payload.id || String(numericId),
              tag: payload.tag || '',
              route: payload.route || data.url || '/focus',
              url: payload.route || data.url || '/focus',
              data: data
            }
          }]
        }).then(function () {
          return { ok: true, id: payload.id || String(numericId), native_id: numericId, scheduled_at: when.toISOString() };
        });
      }).catch(function (e) {
        console.warn('[IsotopeAI] native notification schedule failed:', e && e.message);
        return { ok: false, reason: e && e.message };
      });
    };

    window.__isoCancelNativeNotification = function (id) {
      var ln = getLocalNotifications();
      if (!ln || !ln.cancel) return Promise.resolve({ ok: false, reason: 'LocalNotifications unavailable' });
      return ln.cancel({ notifications: [{ id: nativeNotificationId(id) }] })
        .then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, reason: e && e.message }; });
    };

    window.__isoScheduleFocusTimer = function (payload) {
      payload = payload || {};
      return window.__isoScheduleNativeNotification({
        id: 'isotope-focus-complete',
        title: payload.title || 'Focus session complete',
        body: payload.body || 'Your IsotopeAI focus session is complete.',
        at: payload.at,
        route: '/focus',
        channelId: 'isotope-focus',
        data: { url: '/focus', kind: 'focus-complete' }
      });
    };

    window.__isoCancelFocusTimer = function () {
      return window.__isoCancelNativeNotification('isotope-focus-complete');
    };

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
      return window.__isoEnsureNotificationPermission({ request: true }).then(function (result) {
        if (result && result.permission) {
          _permission = result.permission;
          IsotopeNotification.permission = _permission;
          console.log('[IsotopeAI] Notification permission:', _permission);
          return _permission;
        }
        return ln.requestPermissions().then(function (result) {
        var granted = result && result.display === 'granted';
        _permission = granted ? 'granted' : 'denied';
        IsotopeNotification.permission = _permission;
        console.log('[IsotopeAI] Notification permission:', _permission);
        return _permission;
        });
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

      createNativeNotificationChannel(ln);

      // Check current permission state and sync to polyfill
      if (ln.checkPermissions) {
        ln.checkPermissions().then(function (result) {
          if (result && result.display === 'granted') {
            _permission = 'granted';
            IsotopeNotification.permission = 'granted';
            console.log('[IsotopeAI] Notification permission already granted');
          } else if (result && result.display === 'prompt') {
            _permission = 'default';
            IsotopeNotification.permission = 'default';
            try {
              if (!localStorage.getItem('isotope-native-notification-prompted-v1')) {
                localStorage.setItem('isotope-native-notification-prompted-v1', String(Date.now()));
                setTimeout(function () {
                  window.__isoEnsureNotificationPermission({ request: true });
                }, 1200);
              }
            } catch (e) {}
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
