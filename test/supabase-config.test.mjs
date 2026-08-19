import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadConfig, parseDotEnv } = require('../scripts/supabase-config.js');

const ROOT = path.resolve(import.meta.dirname, '..');

// Isolate env + config between tests so precedence tiers are deterministic.
function withEnv(env, fn) {
  const prev = { ...process.env };
  for (const k of Object.keys(env)) {
    if (env[k] === undefined || env[k] === null) delete process.env[k];
    else process.env[k] = env[k];
  }
  // clear the Supabase-specific keys we care about
  for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_PROJECT_REF', 'SUPA_ENV_PATH', 'SUPA_CONFIG_PATH']) {
    if (!(k in env)) delete process.env[k];
  }
  try { return fn(); } finally { process.env = prev; }
}

const DEFAULT_URL = 'https://ollsqiutzartjhiuzkbf.supabase.co';
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbHNxaXV0emFydGpoaXV6a2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MDkzMDksImV4cCI6MjEwMjE4NTMwOX0.Ryt4Ak9Lx47lvKpMfKozDg0QjxBcP1IHdH7sgqc7x-M';
const DEFAULT_REF = 'ollsqiutzartjhiuzkbf';

test('parseDotEnv parses KEY=value, trims quotes, ignores comments/blank', () => {
  const cfg = parseDotEnv(`# a comment
FOO=hello
BAR="quoted value"
BAZ= spaced
   INDENTED=ok
`);
  assert.equal(cfg.FOO, 'hello');
  assert.equal(cfg.BAR, 'quoted value');
  assert.equal(cfg.BAZ, 'spaced');
  assert.equal(cfg.INDENTED, 'ok');
});

test('with no env/.env, resolves to committed defaults + derived ref', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supa-cfg-'));
  const cfgPath = path.join(tmp, 'supabase.config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({
    url: DEFAULT_URL, anonKey: DEFAULT_ANON, projectRef: DEFAULT_REF,
  }));
  withEnv({ SUPA_CONFIG_PATH: cfgPath, SUPA_ENV_PATH: '/nonexistent/.env' }, () => {
    const cfg = loadConfig();
    assert.equal(cfg.url, DEFAULT_URL);
    assert.equal(cfg.anonKey, DEFAULT_ANON);
    assert.equal(cfg.projectRef, DEFAULT_REF);
    assert.equal(cfg.source.url, 'config.json');
    assert.equal(cfg.source.anonKey, 'config.json');
    assert.equal(cfg.source.projectRef, 'config.json');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('process env overrides .env and config.json (highest precedence)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supa-cfg-'));
  const cfgPath = path.join(tmp, 'supabase.config.json');
  const envPath = path.join(tmp, '.env');
  fs.writeFileSync(cfgPath, JSON.stringify({ url: 'https://default.supabase.co', anonKey: 'default-anon', projectRef: 'defaultref' }));
  fs.writeFileSync(envPath, 'SUPABASE_URL=https://from-dotenv.supabase.co\nSUPABASE_ANON_KEY=dotenv-anon\nSUPABASE_PROJECT_REF=dotenvref\n');
  withEnv({
    SUPA_CONFIG_PATH: cfgPath,
    SUPA_ENV_PATH: envPath,
    SUPABASE_URL: 'https://env.supabase.co',
    SUPABASE_ANON_KEY: 'env-anon',
    SUPABASE_PROJECT_REF: 'envref',
  }, () => {
    const cfg = loadConfig();
    assert.equal(cfg.url, 'https://env.supabase.co');
    assert.equal(cfg.anonKey, 'env-anon');
    assert.equal(cfg.projectRef, 'envref');
    assert.equal(cfg.source.url, 'env');
    assert.equal(cfg.source.anonKey, 'env');
    assert.equal(cfg.source.projectRef, 'env');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('.env overrides config.json (second tier)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supa-cfg-'));
  const cfgPath = path.join(tmp, 'supabase.config.json');
  const envPath = path.join(tmp, '.env');
  fs.writeFileSync(cfgPath, JSON.stringify({ url: DEFAULT_URL, anonKey: DEFAULT_ANON, projectRef: DEFAULT_REF }));
  fs.writeFileSync(envPath, 'SUPABASE_URL=https://dotenv.supabase.co\nSUPABASE_ANON_KEY=dotenv-anon\nSUPABASE_PROJECT_REF=dotenvref\n');
  withEnv({ SUPA_CONFIG_PATH: cfgPath, SUPA_ENV_PATH: envPath }, () => {
    const cfg = loadConfig();
    assert.equal(cfg.url, 'https://dotenv.supabase.co');
    assert.equal(cfg.anonKey, 'dotenv-anon');
    assert.equal(cfg.projectRef, 'dotenvref');
    assert.equal(cfg.source.url, '.env');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('projectRef is derived from SUPABASE_URL when not set explicitly', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supa-cfg-'));
  const cfgPath = path.join(tmp, 'supabase.config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ url: 'https://myprojectref.supabase.co', anonKey: 'a' }));
  withEnv({ SUPA_CONFIG_PATH: cfgPath, SUPA_ENV_PATH: '/nonexistent/.env' }, () => {
    const cfg = loadConfig();
    assert.equal(cfg.url, 'https://myprojectref.supabase.co');
    assert.equal(cfg.projectRef, 'myprojectref');
    assert.equal(cfg.source.projectRef, 'derived');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('prod defaults are used when nothing else is set', () => {
  withEnv({
    SUPA_CONFIG_PATH: path.join(ROOT, 'supabase.config.json'),
    SUPA_ENV_PATH: '/nonexistent/.env',
  }, () => {
    const cfg = loadConfig();
    // defaults must point at the real prod project so a fresh checkout builds the live app
    assert.ok(cfg.url.includes('ollsqiutzartjhiuzkbf.supabase.co'), `bad default url: ${cfg.url}`);
    assert.ok(cfg.anonKey.length > 10, 'default anonKey should be a real JWT');
    assert.equal(cfg.projectRef, 'ollsqiutzartjhiuzkbf');
    assert.equal(cfg.source.url, 'config.json');
  });
});
