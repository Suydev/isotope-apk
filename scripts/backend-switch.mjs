#!/usr/bin/env node
/**
 * backend-switch.mjs — move the app between Supabase projects without touching
 * the dashboard, and configure the parts of a project the schema cannot hold.
 *
 *   node scripts/backend-switch.mjs auth     --ref abc123 [--urls URL,…] [--site-url URL]
 *                                            [--google-client-id ID,…] [--google-secret S] [--dry-run]
 *   node scripts/backend-switch.mjs migrate  --ref abc123 [--from 025] [--only 025] [--list] [--dry-run]
 *   node scripts/backend-switch.mjs repoint  [--url URL --anon-key KEY] [--ref abc123] [--dry-run]
 *   node scripts/backend-switch.mjs verify   --ref abc123
 *   node scripts/backend-switch.mjs projects
 *
 * Why this exists: the app is free to host on both Vercel and Supabase, so the
 * backend can be swapped at will. The schema (supabase/*.sql) and the client
 * (android-bridge.js, www/assets/) both bake the project URL, anon key and ref,
 * and neither the redirect allow-list nor the Google provider lives in the
 * database — they are auth config. This does all of it with a personal access
 * token and nothing else.
 *
 * The verbs are independent on purpose: `auth` and `migrate` are safe to run
 * against prod (additive, idempotent), while `repoint` rewrites committed client
 * files and is only for an actual move.
 *
 * A token is read from --pat, or SUPABASE_ACCESS_TOKEN in the environment (the
 * switch.sh wrapper fills it from the gitignored .pat file).
 */

'use strict';

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createAdmin, resolveKey } from './supabase-admin.mjs';
import { splitStatements } from './supabase-setup.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase');
const CONFIG_PATH = join(ROOT, 'supabase.config.json');

const say = (s) => console.log(`[switch] ${s}`);
const warn = (s) => console.error(`[switch] ${s}`);

// ── arg parsing ──────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    let key, value;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      key = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      key = arg.slice(2);
      value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
    // Repeated flags accumulate ('--url a --url b'), a single use stays a string.
    if (a[key] === undefined) a[key] = value;
    else a[key] = [].concat(a[key], value);
  }
  return a;
}

const asArray = (v) => (v === undefined ? [] : [].concat(v));

// ── migrations ───────────────────────────────────────────────────────────────

/** `013b_harden_rls.sql` → { num: '013', letter: 'b', key: '013b' }. */
export function migrationKey(name) {
  const m = /^(\d{3})([a-z]?)_/.exec(basename(name));
  return m ? { num: m[1], letter: m[2], key: m[1] + m[2] } : null;
}

export function listMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && migrationKey(f))
    .sort((a, b) => {
      const ka = migrationKey(a).key, kb = migrationKey(b).key;
      return ka < kb ? -1 : ka > kb ? 1 : a.localeCompare(b);
    });
}

export function selectMigrations(files, { from, only } = {}) {
  const norm = (v) => String(v).trim().replace(/\.sql$/i, '').replace(/^(\d{1,3})/, (m) => m.padStart(3, '0'));
  const fromKey = from ? (migrationKey(norm(from) + '_x') || {}).key : null;
  return files.filter((f) => {
    const k = migrationKey(f);
    if (!k) return false;
    if (only) {
      const o = norm(only);
      return f === `${o}.sql` || f.startsWith(`${o}_`) || k.key === o;
    }
    if (fromKey && !(k.key >= fromKey)) return false;
    return true;
  });
}

const bareStmt = (s) => s
  .split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .trim();

const TXN = /^(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|END)\s*;?$/i;
const IDEMPOTENT = /already exists|duplicate key|duplicate object|multiple primary keys/i;

export async function applyMigration(admin, ref, file, { dryRun = false, log = say } = {}) {
  const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  const stmts = splitStatements(text).filter((s) => bareStmt(s) && !TXN.test(bareStmt(s)));
  if (dryRun) {
    log(`${file}: ${stmts.length} statement(s) [dry-run]`);
    return { file, statements: stmts.length, ok: 0, skipped: 0, failed: 0, dryRun: true };
  }
  let ok = 0, skipped = 0, failed = 0;
  const failures = [];
  const BATCH = 50;
  for (let i = 0; i < stmts.length; i += BATCH) {
    const chunk = stmts.slice(i, i + BATCH);
    try {
      await admin.query(ref, chunk.map((s) => s.replace(/;+$/, '')).join(';\n') + ';');
      ok += chunk.length;
    } catch {
      for (const s of chunk) {
        try { await admin.query(ref, s); ok++; }
        catch (e) {
          if (IDEMPOTENT.test(e.message || '')) skipped++;
          else { failed++; if (failures.length < 10) failures.push({ stmt: s.slice(0, 160), msg: (e.message || '').slice(0, 200) }); }
        }
      }
    }
  }
  log(`${file}: ${ok} applied, ${skipped} already-present, ${failed} failed`);
  for (const f of failures) warn(`  FAILED: ${f.msg}\n    at ${f.stmt}`);
  return { file, statements: stmts.length, ok, skipped, failed, failures };
}

// ── auth config ──────────────────────────────────────────────────────────────

/** Union two comma-separated allow-lists, trimmed and de-duplicated, order kept. */
export function mergeRedirectUrls(existing, additions) {
  const set = new Set();
  for (const part of String(existing || '').split(',')) {
    const v = part.trim();
    if (v) set.add(v);
  }
  for (const part of asArray(additions)) {
    for (const p of String(part || '').split(',')) {
      const v = p.trim();
      if (v) set.add(v);
    }
  }
  return [...set].join(',');
}

async function cmdAuth(admin, args) {
  const ref = args.ref;
  if (!ref) throw new Error('auth requires --ref <project-ref>');
  const urls = asArray(args.url).concat(asArray(args.urls));
  const siteUrl = typeof args['site-url'] === 'string' ? args['site-url'] : null;
  const googleId = typeof args['google-client-id'] === 'string' ? args['google-client-id'] : null;
  const googleSecret = typeof args['google-secret'] === 'string' ? args['google-secret'] : null;

  const current = await admin.getAuthConfig(ref);
  const patch = {};
  if (siteUrl) patch.site_url = siteUrl;
  if (urls.length) {
    patch.uri_allow_list = mergeRedirectUrls(current.uri_allow_list, urls);
  }
  if (googleId) {
    patch.external_google_client_id = mergeRedirectUrls(current.external_google_client_id, googleId);
    patch.external_google_enabled = true;
  }
  if (googleSecret) patch.external_google_secret = googleSecret;

  if (!Object.keys(patch).length) {
    say('nothing to change — pass --urls/--site-url/--google-*');
    say(`current site_url:       ${current.site_url}`);
    say(`current redirects:      ${current.uri_allow_list}`);
    say(`google enabled:         ${current.external_google_enabled}`);
    return;
  }

  if (args['dry-run']) {
    say('dry-run — would PATCH /config/auth with:');
    for (const [k, v] of Object.entries(patch)) say(`  ${k} = ${k === 'external_google_secret' ? '(redacted)' : v}`);
    return;
  }

  await admin.patchAuthConfig(ref, patch);
  const after = await admin.getAuthConfig(ref);
  say(`site_url:    ${after.site_url}`);
  say(`redirects:   ${after.uri_allow_list}`);
  say(`google:      ${after.external_google_enabled ? 'enabled' : 'disabled'}`);
  const added = mergeRedirectUrls(current.uri_allow_list, urls) !== (current.uri_allow_list || '')
    ? urls : [];
  for (const u of asArray(added).flatMap((x) => String(x).split(','))) {
    if (u.trim() && !String(current.uri_allow_list || '').includes(u.trim())) say(`  + ${u.trim()}`);
  }
}

// ── client repoint ───────────────────────────────────────────────────────────

const URL_RE = /https:\/\/[a-z0-9]{20}\.supabase\.co/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_.-]{8,}/g;

/**
 * Swap every baked Supabase constant in one file's text. Returns the new text
 * and whether anything moved. A JWT is only replaced when its payload says
 * `"role":"anon"` — a session or service key that happened to be baked must not
 * be silently rewritten into the new project's anon key.
 */
export function rewriteSupabaseConstants(text, { newUrl, newAnon, newRef }) {
  const refs = new Set();
  for (const m of text.match(URL_RE) || []) refs.add(m.match(/\/([a-z0-9]{20})\./)[1]);

  let out = text.replace(URL_RE, newUrl);
  out = out.replace(JWT_RE, (jwt) => {
    try {
      const payload = JSON.parse(Buffer.from(
        jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (payload && payload.role === 'anon') return newAnon;
    } catch { /* not a decodable JWT — leave it */ }
    return jwt;
  });
  if (newRef) {
    for (const oldRef of refs) {
      if (oldRef !== newRef) out = out.split(oldRef).join(newRef);
    }
  }
  return { text: out, changed: out !== text, refs: [...refs] };
}

export function clientFiles(root = ROOT) {
  const files = [join(root, 'android-bridge.js')];
  const www = join(root, 'www');
  for (const f of ['android-bridge.js', 'auth-bridge.js', 'auth/callback.html']) {
    files.push(join(www, f));
  }
  const assets = join(www, 'assets');
  if (existsSync(assets)) {
    for (const f of readdirSync(assets)) {
      if (f.endsWith('.js')) files.push(join(assets, f));
    }
  }
  return files.filter((f) => existsSync(f));
}

async function cmdRepoint(admin, args) {
  let ref = args.ref;
  let url = args.url;
  let anon = args['anon-key'];
  if (!url && ref) url = `https://${ref}.supabase.co`;
  if (url && !ref) ref = (url.match(/^https?:\/\/([^.]+)\./) || [])[1];
  if (!url) throw new Error('repoint requires --url or --ref');
  if (!anon && admin && ref) {
    anon = resolveKey(await admin.keys(ref), 'anon');
    if (anon) say('anon key resolved from the Management API');
  }
  if (!anon) throw new Error('repoint requires --anon-key (or a --pat to resolve it)');
  url = url.replace(/\/+$/, '');

  const patch = { newUrl: url, newAnon: anon, newRef: ref };
  const touched = [];
  for (const file of clientFiles()) {
    const before = readFileSync(file, 'utf8');
    const { text, changed } = rewriteSupabaseConstants(before, patch);
    if (changed) {
      touched.push(file.replace(ROOT + '/', ''));
      if (!args['dry-run']) writeFileSync(file, text, 'utf8');
    }
  }

  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const cfgChanged = cfg.url !== url || cfg.anonKey !== anon || cfg.projectRef !== ref;
  if (cfgChanged && !args['dry-run']) {
    writeFileSync(CONFIG_PATH, JSON.stringify({ ...cfg, url, anonKey: anon, projectRef: ref }, null, 2) + '\n');
  }

  say(`${args['dry-run'] ? '[dry-run] would repoint' : 'repointed'} ${touched.length} client file(s) → ${ref}`);
  for (const f of touched) say(`  ${f}`);
  if (cfgChanged) say(`  + supabase.config.json${args['dry-run'] ? ' (would update)' : ''}`);
  if (!touched.length && !cfgChanged) say('  already pointing at this project');
}

// ── verify / projects ────────────────────────────────────────────────────────

function cmdVerify(args, pat) {
  const ref = args.ref;
  if (!ref) throw new Error('verify requires --ref <project-ref>');
  const script = join(ROOT, 'scripts', 'supabase-check.mjs');
  const res = spawnSync(process.execPath, [script, '--ref', ref], {
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: pat },
  });
  if (res.status !== 0) process.exit(res.status || 1);
}

async function cmdProjects(admin) {
  const projects = await admin.listProjects();
  for (const p of projects) console.log(`${p.id}  ${p.name}  [${p.region}]`);
  say(`${listMigrations().length} committed migrations`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [verb, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const pat = args.pat || process.env.SUPABASE_ACCESS_TOKEN;
  const admin = pat ? createAdmin(pat) : null;

  switch (verb) {
    case 'projects':
      return cmdProjects(admin || (() => { throw new Error('a token is required'); })());
    case 'list': {
      const files = selectMigrations(listMigrations(), args);
      say(`${files.length} migration(s)${args.from ? ` from ${args.from}` : ''}${args.only ? ` matching ${args.only}` : ''}:`);
      for (const f of files) say(`  ${f}`);
      return;
    }
    case 'migrate': {
      if (!admin) throw new Error('migrate requires --pat or SUPABASE_ACCESS_TOKEN');
      const ref = args.ref;
      if (!ref) throw new Error('migrate requires --ref <project-ref>');
      const files = selectMigrations(listMigrations(), args);
      if (!files.length) { say('nothing to apply'); return; }
      say(`${args['dry-run'] ? '[dry-run] ' : ''}applying ${files.length} migration(s) to ${ref}`);
      let failed = 0;
      for (const f of files) {
        const r = await applyMigration(admin, ref, f, { dryRun: Boolean(args['dry-run']) });
        failed += r.failed || 0;
      }
      if (failed) { warn(`${failed} statement(s) failed`); process.exit(1); }
      say('done');
      return;
    }
    case 'auth':
      if (!admin) throw new Error('auth requires --pat or SUPABASE_ACCESS_TOKEN');
      return cmdAuth(admin, args);
    case 'repoint':
      return cmdRepoint(admin, args);
    case 'verify':
      return cmdVerify(args, pat);
    default:
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8')
        .split('\n').filter((l) => /^\s*(\*|node scripts\/backend-switch)/.test(l))
        .map((l) => l.replace(/^\s*\*\/?\s?/, '').replace(/^\s*\*\s?/, ''))
        .join('\n')
        .slice(0, 1400));
      if (verb) { warn(`unknown verb: ${verb}`); process.exit(2); }
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  main().catch((e) => { warn(`ERROR: ${e.message}`); process.exit(1); });
}

export { cmdAuth, cmdRepoint };
