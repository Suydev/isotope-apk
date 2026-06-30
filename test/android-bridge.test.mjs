import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const BRIDGE_PATH = path.join(ROOT, 'android-bridge.js');
const SUPA_URL = 'https://vteqquoqvksshmfhuepu.supabase.co';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  get length() {
    return this.map.size;
  }
  key(index) {
    return Array.from(this.map.keys())[index] || null;
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
  removeItem(key) {
    this.map.delete(String(key));
  }
  clear() {
    this.map.clear();
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(value, status = 200) {
  return new Response(String(value), { status });
}

function makeSession(userId = '11111111-1111-4111-8111-111111111111') {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: userId, email: 'student@example.com' },
  };
}

function createBridgeHarness(handler, options = {}) {
  const calls = [];
  const events = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  const localStorage = new MemoryStorage();
  const addListener = (target, type, callback) => {
    if (!target.has(type)) target.set(type, []);
    target.get(type).push(callback);
  };
  const emit = (target, event) => {
    events.push(event);
    for (const callback of target.get(event.type) || []) callback(event);
  };
  const document = {
    addEventListener(type, callback) { addListener(documentListeners, type, callback); },
    dispatchEvent(event) { emit(documentListeners, event); return true; },
    querySelector() { return null; },
    createElement() { return { style: {}, set textContent(value) { this._text = value; }, get textContent() { return this._text; } }; },
    documentElement: { style: {} },
    head: { appendChild() {} },
  };
  const window = {
    Capacitor: { Plugins: options.plugins || {} },
    location: { protocol: 'https:', origin: 'https://app.local', pathname: '/' },
    history: { back() {} },
    localStorage,
    sessionStorage: new MemoryStorage(),
    document,
    navigator: { userAgent: 'Android' },
    addEventListener(type, callback) { addListener(windowListeners, type, callback); },
    dispatchEvent(event) { emit(windowListeners, event); return true; },
    setTimeout,
    clearTimeout,
    console,
  };
  window.window = window;
  const context = {
    window,
    localStorage,
    sessionStorage: window.sessionStorage,
    document,
    navigator: window.navigator,
    console,
    URL,
    Response,
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    Event: class Event {
      constructor(type) { this.type = type; }
    },
    KeyboardEvent: class KeyboardEvent {
      constructor(type, init) { this.type = type; this.key = init?.key; this.bubbles = init?.bubbles; }
    },
    setTimeout,
    clearTimeout,
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return handler(String(url), init);
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(BRIDGE_PATH, 'utf8'), context, { filename: BRIDGE_PATH });
  return { context, window, localStorage, calls, events };
}

function installSession(storage, session = makeSession()) {
  storage.setItem('sb-vteqquoqvksshmfhuepu-auth-token', JSON.stringify(session));
  storage.setItem('isotope-auth-token', JSON.stringify(session));
  storage.setItem('isotope-last-session-raw', JSON.stringify(session));
  return session;
}

function defaultSupabaseHandler({ profileRow, onboardingRow, userRow, backupText, failBootstrap = false } = {}) {
  return async (url) => {
    if (url.includes('/auth/v1/signup')) return jsonResponse({ should_not: 'be called' }, 500);
    if (failBootstrap && url.includes('/rest/v1/user_profiles')) {
      throw new Error('network down');
    }
    if (url.includes('/rest/v1/user_profiles')) return jsonResponse(profileRow ? [profileRow] : []);
    if (url.includes('/rest/v1/users')) return jsonResponse(userRow ? [userRow] : []);
    if (url.includes('/rest/v1/user_onboarding')) return jsonResponse(onboardingRow ? [onboardingRow] : []);
    if (url.includes('/rest/v1/user_settings')) return jsonResponse([{ settings: { theme: 'dark' } }]);
    if (url.includes('/rest/v1/user_stats_summary')) return jsonResponse([]);
    if (url.includes('/rest/v1/daily_user_stats')) return jsonResponse([]);
    if (url.includes('/rest/v1/study_sessions_log')) return jsonResponse([]);
    if (url.includes('/storage/v1/object/list/user-content')) return jsonResponse([]);
    if (url.includes('/storage/v1/object/user-content/')) {
      return backupText ? textResponse(backupText) : textResponse('not found', 404);
    }
    return jsonResponse([]);
  };
}

function backupPayload(data = {}, exportedAt = '2026-06-30T00:00:00.000Z') {
  return {
    version: 1,
    source: 'isotopeai',
    exportedAt,
    appVersion: 'test',
    data: {
      profile: data.profile ?? null,
      timerState: data.timerState ?? null,
      tasks: data.tasks ?? [],
      sessions: data.sessions ?? [],
      subjects: data.subjects ?? [],
      habits: data.habits ?? [],
      dailyLogs: data.dailyLogs ?? [],
      tests: data.tests ?? [],
      exams: data.exams ?? [],
      mockTests: data.mockTests ?? [],
    },
  };
}

function createStorageSupabaseHandler(userId, initialObjects = {}, extraHandler = async () => null) {
  const objects = new Map(Object.entries(initialObjects));
  const deleted = [];
  const uploaded = [];
  const handler = async (url, init = {}) => {
    const extra = await extraHandler(url, init, { objects, deleted, uploaded });
    if (extra) return extra;
    if (url.includes('/rest/v1/backup_manifests')) return jsonResponse([{ recorded: true }]);
    if (url.includes('/rest/v1/user_profiles')) return jsonResponse([{ profile_data: {}, updated_at: '2026-06-30T00:00:00Z' }]);
    if (url.includes('/storage/v1/object/list/user-content')) {
      const body = init.body ? JSON.parse(init.body) : {};
      const prefix = body.prefix || '';
      const rows = Array.from(objects.keys())
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({
          name: key.slice(prefix.length),
          updated_at: '2026-06-30T00:00:00Z',
          metadata: { size: String(objects.get(key)).length },
        }))
        .filter((row) => row.name && !row.name.includes('/'));
      return jsonResponse(rows);
    }
    if (url.includes('/storage/v1/object/user-content/')) {
      const objectPath = decodeURIComponent(url.split('/storage/v1/object/user-content/')[1]);
      if ((init.method || 'GET').toUpperCase() === 'POST') {
        objects.set(objectPath, String(init.body || ''));
        uploaded.push(objectPath);
        return jsonResponse({ Key: objectPath });
      }
      if (!objects.has(objectPath)) return textResponse('not found', 404);
      return textResponse(objects.get(objectPath));
    }
    if (url.endsWith('/storage/v1/object/user-content') && (init.method || '').toUpperCase() === 'DELETE') {
      const body = init.body ? JSON.parse(init.body) : {};
      for (const prefix of body.prefixes || []) {
        if (objects.delete(prefix)) deleted.push(prefix);
      }
      return jsonResponse([]);
    }
    return jsonResponse([]);
  };
  handler.objects = objects;
  handler.deleted = deleted;
  handler.uploaded = uploaded;
  handler.userId = userId;
  return handler;
}

async function fetchJson(window, pathName, init = {}) {
  const response = await window.fetch(pathName, init);
  return { response, data: await response.json() };
}

test('/__auth/check is neutral and performs no signup request', async () => {
  const harness = createBridgeHarness(defaultSupabaseHandler());
  const { data } = await fetchJson(harness.window, '/__auth/check', {
    method: 'POST',
    body: JSON.stringify({ email: 'new@example.com' }),
  });

  assert.equal(data.ok, true);
  assert.equal(data.neutral, true);
  assert.equal(data.available, true);
  assert.equal(harness.calls.some((call) => call.url.includes('/auth/v1/signup')), false);
});

test('bootstrap returns canonical onboarding.completed=true and raw profile_data', async () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const harness = createBridgeHarness(defaultSupabaseHandler({
    profileRow: { profile_data: { display_name: 'Asha', settings: { density: 'compact' } }, updated_at: '2026-06-01T00:00:00Z' },
    userRow: { id: userId, username: 'asha', name: 'Asha' },
    onboardingRow: { completed: true, completed_at: '2026-06-02T00:00:00Z', data: { exam: 'JEE' } },
  }));
  installSession(harness.localStorage, makeSession(userId));

  const { data } = await fetchJson(harness.window, '/__auth/bootstrap');

  assert.equal(data.ok, true);
  assert.equal(data.user_id, userId);
  assert.equal(data.onboarding.completed, true);
  assert.equal(data.onboarding.state, 'completed');
  assert.equal(data.onboarding_completed, true);
  assert.equal(data.profile.display_name, 'Asha');
  assert.deepEqual(data.profile_data, { display_name: 'Asha', settings: { density: 'compact' } });
  assert.equal(data.profile_updated_at, '2026-06-01T00:00:00Z');
  assert.deepEqual(data.daily_user_stats, []);
  assert.deepEqual(data.study_sessions_log, []);
  assert.equal(data.restore_recommended, false);
});

test('bootstrap returns onboarding.completed=false for seeded new-account row', async () => {
  const userId = '33333333-3333-4333-8333-333333333333';
  const harness = createBridgeHarness(defaultSupabaseHandler({
    profileRow: { profile_data: {}, updated_at: '2026-06-01T00:00:00Z' },
    userRow: { id: userId, username: 'new_user' },
    onboardingRow: { completed: false, completed_at: null, data: {} },
  }));
  installSession(harness.localStorage, makeSession(userId));

  const { data } = await fetchJson(harness.window, '/__auth/bootstrap');

  assert.equal(data.ok, true);
  assert.equal(data.onboarding.completed, false);
  assert.equal(data.onboarding.state, 'incomplete');
  assert.equal(data.onboarding_completed, false);
});

test('bootstrap migrates legacy meaningful profile without row to completed', async () => {
  const userId = '44444444-4444-4444-8444-444444444444';
  const harness = createBridgeHarness(defaultSupabaseHandler({
    profileRow: { profile_data: { display_name: 'Legacy Student', target_exam: 'NEET' }, updated_at: '2026-06-01T00:00:00Z' },
    userRow: { id: userId, username: 'legacy' },
    onboardingRow: null,
  }));
  installSession(harness.localStorage, makeSession(userId));

  const { data } = await fetchJson(harness.window, '/__auth/bootstrap');

  assert.equal(data.ok, true);
  assert.equal(data.onboarding.completed, true);
  assert.equal(data.onboarding_completed, true);
  assert.equal(harness.calls.some((call) => call.url.includes('/rest/v1/user_onboarding?on_conflict=user_id')), true);
});

test('bootstrap network failure does not pretend onboarding is complete', async () => {
  const userId = '55555555-5555-4555-8555-555555555555';
  const harness = createBridgeHarness(defaultSupabaseHandler({ failBootstrap: true }));
  installSession(harness.localStorage, makeSession(userId));

  const { response, data } = await fetchJson(harness.window, '/__auth/bootstrap');

  assert.equal(response.status, 503);
  assert.equal(data.ok, false);
  assert.equal(data.onboarding.state, 'unknown');
  assert.equal('onboarding_completed' in data, false);
});

test('onboarding completion uses verified upsert and returns persisted row', async () => {
  const userId = '66666666-6666-4666-8666-666666666666';
  const harness = createBridgeHarness(async (url, init = {}) => {
    if (url.includes('/rest/v1/user_onboarding?on_conflict=user_id')) {
      assert.equal(init.method, 'POST');
      assert.match(init.headers.Prefer, /resolution=merge-duplicates/);
      assert.match(init.headers.Prefer, /return=representation/);
      const body = JSON.parse(init.body);
      assert.equal(body.user_id, userId);
      assert.equal(body.completed, true);
      return jsonResponse([{ user_id: userId, completed: true, completed_at: body.completed_at, data: body.data }]);
    }
    return jsonResponse([]);
  });
  installSession(harness.localStorage, makeSession(userId));

  const { data } = await fetchJson(harness.window, '/__auth/onboarding-complete', {
    method: 'POST',
    body: JSON.stringify({ onboarding_data: { goal: 'rank' } }),
  });

  assert.equal(data.ok, true);
  assert.equal(data.onboarding_completed, true);
  assert.equal(data.onboarding.completed, true);
  assert.deepEqual(data.onboarding.data, { goal: 'rank' });
});

test('RPC failure is propagated instead of returned as ok:true', async () => {
  const harness = createBridgeHarness(async (url) => {
    if (url.includes('/rest/v1/rpc/get_leaderboard')) {
      return jsonResponse({ message: 'bad rpc' }, 400);
    }
    return jsonResponse([]);
  });
  installSession(harness.localStorage);

  const { response, data } = await fetchJson(harness.window, '/__supa/functions/v1/get-leaderboard', { method: 'POST' });

  assert.equal(response.status, 400);
  assert.equal(data.ok, false);
  assert.match(data.error, /bad rpc/);
});

test('direct Supabase function URLs are intercepted and RPC payloads are mapped', async () => {
  const userId = '77777777-7777-4777-8777-777777777777';
  const rpcBodies = [];
  const storageHandler = createStorageSupabaseHandler(userId, {}, async (url, init) => {
    if (url.includes('/rest/v1/rpc/get_leaderboard')) {
      rpcBodies.push({ rpc: 'leaderboard', body: JSON.parse(init.body) });
      return jsonResponse([{ rank: 1, user_id: userId, name: 'Student', score: 4 }]);
    }
    if (url.includes('/rest/v1/rpc/get_group_leaderboard')) {
      rpcBodies.push({ rpc: 'group_leaderboard', body: JSON.parse(init.body) });
      return jsonResponse([{ rank: 1, user_id: userId, points: 12 }]);
    }
    if (url.includes('/rest/v1/rpc/get_group_analytics_from_snapshots')) {
      rpcBodies.push({ rpc: 'group_analytics', body: JSON.parse(init.body) });
      return jsonResponse([{ study_date: '2026-06-30', total_seconds: 3600, member_count: 2 }]);
    }
    return null;
  });
  const harness = createBridgeHarness(storageHandler);
  installSession(harness.localStorage, makeSession(userId));

  const daily = await fetchJson(harness.window, `${SUPA_URL}/functions/v1/get-daily-leaderboard`, {
    method: 'POST',
    body: JSON.stringify({ limit: 7 }),
  });
  const groupLeaderboard = await fetchJson(harness.window, `${SUPA_URL}/functions/v1/get-group-leaderboard`, {
    method: 'POST',
    body: JSON.stringify({ groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', limit: 9 }),
  });
  const groupAnalytics = await fetchJson(harness.window, `${SUPA_URL}/functions/v1/get-group-analytics`, {
    method: 'POST',
    body: JSON.stringify({ groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', days: 14 }),
  });

  assert.equal(daily.data.ok, true);
  assert.equal(groupLeaderboard.data.ok, true);
  assert.equal(groupAnalytics.data.ok, true);
  assert.equal(harness.calls.some((call) => call.url.includes('/rest/v1/rpc/get_daily_leaderboard')), false);
  assert.deepEqual(rpcBodies.find((row) => row.rpc === 'leaderboard').body, {
    p_period: 'daily',
    p_limit: 7,
    p_offset: 0,
  });
  assert.deepEqual(rpcBodies.find((row) => row.rpc === 'group_leaderboard').body, {
    p_group_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    p_limit: 9,
  });
  assert.deepEqual(rpcBodies.find((row) => row.rpc === 'group_analytics').body, {
    p_group_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    p_days: 14,
  });
});

test('finish-session maps compiled payload to finish_session_sync and snapshots local data', async () => {
  const userId = '88888888-8888-4888-8888-888888888888';
  let rpcBody;
  const storageHandler = createStorageSupabaseHandler(userId, {}, async (url, init) => {
    if (url.includes('/rest/v1/rpc/finish_session_sync')) {
      rpcBody = JSON.parse(init.body);
      return jsonResponse({ affected_group_ids: [], challenge_updates: [] });
    }
    return null;
  });
  const harness = createBridgeHarness(storageHandler);
  installSession(harness.localStorage, makeSession(userId));
  harness.window.IsotopeLocalDataAdapter = {
    async buildBackupPayloadFromLocal() {
      return backupPayload({ sessions: [{ id: 'local-session', duration: 25 }] });
    },
  };

  const { data } = await fetchJson(harness.window, `${SUPA_URL}/functions/v1/finish-session`, {
    method: 'POST',
    body: JSON.stringify({
      session_id: '99999999-9999-4999-8999-999999999999',
      action: 'complete',
      durationMinutes: 25,
      groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sessionType: 'questions',
      notes: 'done',
      endedAt: '2026-06-30T01:00:00Z',
    }),
  });

  assert.equal(data.ok, true);
  assert.deepEqual(rpcBody, {
    p_session_id: '99999999-9999-4999-8999-999999999999',
    p_action: 'complete',
    p_duration_minutes: 25,
    p_group_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    p_session_type: 'questions',
    p_notes: 'done',
    p_ended_at: '2026-06-30T01:00:00Z',
  });
  assert.ok(storageHandler.uploaded.includes(`${userId}/backups/latest.json`));
  assert.ok(storageHandler.uploaded.includes(`${userId}/cloud-snapshot/latest.json`));
});

test('backup upload blocks empty local overwrite of richer cloud backup', async () => {
  const userId = '99999999-9999-4999-8999-999999999999';
  const richCloud = JSON.stringify(backupPayload({ tasks: [{ id: 'cloud-task', title: 'Keep me' }] }));
  const storageHandler = createStorageSupabaseHandler(userId, {
    [`${userId}/backups/latest.json`]: richCloud,
  });
  const harness = createBridgeHarness(storageHandler);
  installSession(harness.localStorage, makeSession(userId));

  const { response, data } = await fetchJson(harness.window, '/__auth/backup', {
    method: 'POST',
    body: JSON.stringify({ backup_json: backupPayload({ profile: { display_name: 'Fresh install' } }) }),
  });

  assert.equal(response.status, 409);
  assert.equal(data.code, 'BLOCKED_EMPTY_OVERWRITE');
  assert.equal(data.selected_backup.rich, true);
  assert.equal(storageHandler.uploaded.length, 0);
});

test('backup upload writes canonical latest/history/cloud snapshot and cleans stale user files', async () => {
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const emptyOld = JSON.stringify(backupPayload({ profile: { display_name: 'old' } }, '2026-06-01T00:00:00.000Z'));
  const storageHandler = createStorageSupabaseHandler(userId, {
    [`${userId}/imports/old-empty.json`]: emptyOld,
  });
  const harness = createBridgeHarness(storageHandler);
  installSession(harness.localStorage, makeSession(userId));

  const localRich = backupPayload({
    tasks: [{ id: 'task-1', title: 'Physics' }],
    sessions: [{ id: 'session-1', duration: 40 }],
  });
  const { data } = await fetchJson(harness.window, '/__auth/backup', {
    method: 'POST',
    body: JSON.stringify({ backup_json: localRich }),
  });

  assert.equal(data.ok, true);
  assert.equal(data.code, 'CANONICAL_BACKUP_WRITTEN');
  assert.equal(data.collection_counts.tasks, 1);
  assert.ok(storageHandler.uploaded.includes(`${userId}/backups/latest.json`));
  assert.ok(storageHandler.uploaded.some((item) => item.startsWith(`${userId}/backups/history/`)));
  assert.ok(storageHandler.uploaded.includes(`${userId}/cloud-snapshot/latest.json`));
  assert.ok(storageHandler.deleted.includes(`${userId}/imports/old-empty.json`));
  assert.equal(storageHandler.deleted.includes(`${userId}/backups/latest.json`), false);
  assert.equal(storageHandler.deleted.includes(`${userId}/cloud-snapshot/latest.json`), false);
});

test('restore-best-backup returns browser restore payload with selected backup', async () => {
  const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const richCloud = JSON.stringify(backupPayload({ subjects: [{ id: 'sub-1', name: 'Chemistry' }] }));
  const storageHandler = createStorageSupabaseHandler(userId, {
    [`${userId}/exports/latest.json`]: richCloud,
  });
  const harness = createBridgeHarness(storageHandler);
  installSession(harness.localStorage, makeSession(userId));

  const { data } = await fetchJson(harness.window, '/__auth/restore-best-backup', {
    method: 'POST',
    body: JSON.stringify({ promote: false }),
  });

  assert.equal(data.ok, true);
  assert.equal(data.restore_required_on_browser, true);
  assert.equal(data.selected_backup.path, `${userId}/exports/latest.json`);
  assert.equal(typeof data.backup_json, 'string');
  assert.equal(data.collection_counts.subjects, 1);
});

test('import archives backup, promotes canonical copy, and returns restore metadata', async () => {
  const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const storageHandler = createStorageSupabaseHandler(userId);
  const harness = createBridgeHarness(storageHandler);
  installSession(harness.localStorage, makeSession(userId));

  const incoming = backupPayload({ habits: [{ id: 'habit-1', title: 'Read' }] });
  const { data } = await fetchJson(harness.window, '/__auth/import', {
    method: 'POST',
    body: JSON.stringify({ backup_json: incoming }),
  });

  assert.equal(data.ok, true);
  assert.equal(data.code, 'IMPORT_ARCHIVED_AND_PROMOTED');
  assert.equal(data.restore_required_on_browser, true);
  assert.equal(data.collection_counts.habits, 1);
  assert.ok(storageHandler.uploaded.includes(`${userId}/imports/latest.json`));
  assert.ok(storageHandler.uploaded.includes(`${userId}/backups/latest.json`));
  assert.ok(storageHandler.uploaded.includes(`${userId}/cloud-snapshot/latest.json`));
});

test('Android bridge routes online state through Capacitor Network', async () => {
  let networkListener;
  const harness = createBridgeHarness(defaultSupabaseHandler(), {
    plugins: {
      Network: {
        async getStatus() { return { connected: false }; },
        addListener(eventName, callback) {
          assert.equal(eventName, 'networkStatusChange');
          networkListener = callback;
        },
      },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.window.__isoIsOnline(), false);
  assert.equal(harness.window.navigator.onLine, false);

  networkListener({ connected: true });
  assert.equal(harness.window.__isoIsOnline(), true);
  assert.equal(harness.window.navigator.onLine, true);
  assert.equal(harness.events.some((event) => event.type === 'isotope:network' && event.detail.connected === true), true);
});

test('native notifications use ic_notification and allowWhileIdle scheduling', async () => {
  const scheduled = [];
  const channels = [];
  const harness = createBridgeHarness(defaultSupabaseHandler(), {
    plugins: {
      LocalNotifications: {
        async createChannel(channel) { channels.push(channel); },
        async checkPermissions() { return { display: 'granted' }; },
        async schedule(payload) { scheduled.push(payload); },
      },
    },
  });

  const result = await harness.window.__isoScheduleNativeNotification({
    id: 'unit-native',
    title: 'Done',
    body: 'Finished',
    at: Date.now() + 10_000,
    route: '/focus',
  });

  assert.equal(result.ok, true);
  assert.equal(channels[0].id, 'isotope-focus');
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].notifications[0].smallIcon, 'ic_notification');
  assert.equal(scheduled[0].notifications[0].schedule.allowWhileIdle, true);
  assert.equal(scheduled[0].notifications[0].extra.route, '/focus');
});

test('focus timer native scheduling cancels previous completion notification first', async () => {
  const canceled = [];
  const scheduled = [];
  const harness = createBridgeHarness(defaultSupabaseHandler(), {
    plugins: {
      LocalNotifications: {
        async createChannel() {},
        async checkPermissions() { return { display: 'granted' }; },
        async cancel(payload) { canceled.push(payload); },
        async schedule(payload) { scheduled.push(payload); },
      },
    },
  });

  const result = await harness.window.__isoScheduleFocusTimer({ at: Date.now() + 60_000 });

  assert.equal(result.ok, true);
  assert.equal(canceled.length, 1);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].notifications[0].extra.data.kind, 'focus-complete');
  assert.equal(scheduled[0].notifications[0].smallIcon, 'ic_notification');
});
