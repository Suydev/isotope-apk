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

  const { response, data } = await fetchJson(harness.window, '/__supa/functions/v1/get-leaderboard', { method: 'POST' });

  assert.equal(response.status, 400);
  assert.equal(data.ok, false);
  assert.match(data.error, /bad rpc/);
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

test('Focus PiP bridge delegates to the Android JavaScript interface', async () => {
  let entered = 0;
  const harness = createBridgeHarness(defaultSupabaseHandler());
  harness.window.IsotopeAndroid = {
    isPipSupported() { return true; },
    enterFocusPip() { entered += 1; },
  };

  assert.equal(harness.window.__isoAndroidPipSupported(), true);
  const result = await harness.window.__isoEnterFocusPip({ route: '/focus' });

  assert.equal(result.ok, true);
  assert.equal(entered, 1);
  assert.match(harness.localStorage.getItem('isotope-focus-pip-state'), /"route":"\/focus"/);
});
