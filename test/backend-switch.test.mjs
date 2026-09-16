import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseArgs,
  migrationKey,
  listMigrations,
  selectMigrations,
  mergeRedirectUrls,
  rewriteSupabaseConstants,
} from '../scripts/backend-switch.mjs';

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = (payload) => `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url(payload)}.sig_abcdefgh`;

const anonJwt = (ref) => jwt({ iss: 'supabase', ref, role: 'anon' });
const serviceJwt = (ref) => jwt({ iss: 'supabase', ref, role: 'service_role' });

const OLD_REF = 'aaaaaaaaaaaaaaaaaaaa';
const NEW_REF = 'bbbbbbbbbbbbbbbbbbbb';
const OLD_URL = `https://${OLD_REF}.supabase.co`;
const NEW_URL = `https://${NEW_REF}.supabase.co`;

test('parseArgs reads space and equals forms, and accumulates repeats', () => {
  const a = parseArgs(['--ref', 'abc', '--url=x', '--dry-run', '--urls', 'a,b', '--urls', 'c']);
  assert.equal(a.ref, 'abc');
  assert.equal(a.url, 'x');
  assert.equal(a['dry-run'], true);
  assert.deepEqual(a.urls, ['a,b', 'c']);
});

test('migrationKey orders a letter suffix after its base', () => {
  assert.deepEqual(migrationKey('013_fix.sql'), { num: '013', letter: '', key: '013' });
  assert.deepEqual(migrationKey('013b_harden.sql'), { num: '013', letter: 'b', key: '013b' });
  assert.equal(migrationKey('readme.sql'), null);
});

test('listMigrations is sorted with 013b between 013 and 014', () => {
  const files = listMigrations();
  assert.ok(files.length > 0);
  const i013 = files.indexOf('013_fix_missing_grants_and_announcements_rls.sql');
  const i013b = files.indexOf('013b_harden_rls_security.sql');
  const i014 = files.indexOf('014_join_policy_join_requests.sql');
  assert.ok(i013 < i013b && i013b < i014, 'expected 013 < 013b < 014');
  assert.ok(!files.some((f) => f.startsWith('_rollback')));
});

test('selectMigrations honours from (padded or not) and only', () => {
  const files = listMigrations();
  const fromPadded = selectMigrations(files, { from: '013' });
  const fromBare = selectMigrations(files, { from: '13' });
  assert.deepEqual(fromBare, fromPadded);
  assert.ok(fromPadded.includes('013b_harden_rls_security.sql'));
  assert.ok(!fromPadded.includes('012_seed_community_data.sql'));

  const only = selectMigrations(files, { only: '025' });
  assert.deepEqual(only, ['025_overview_profile.sql']);
  assert.deepEqual(selectMigrations(files, { only: '025_overview_profile.sql' }), only);
});

test('mergeRedirectUrls unions, trims, dedupes and keeps order', () => {
  const merged = mergeRedirectUrls('https://a/**, https://b/**', ['https://b/**', 'https://c/**']);
  assert.equal(merged, 'https://a/**,https://b/**,https://c/**');
  assert.equal(mergeRedirectUrls('', []), '');
  assert.equal(mergeRedirectUrls(null, 'https://x/**'), 'https://x/**');
  assert.equal(mergeRedirectUrls('https://a/**', ''), 'https://a/**');
});

test('rewriteSupabaseConstants swaps url, anon key, ref vars and token keys', () => {
  const text = [
    `var SUPA_URL = '${OLD_URL}';`,
    `var SUPA_ANON_KEY = '${anonJwt(OLD_REF)}';`,
    `var ref = '${OLD_REF}';`,
    `localStorage.getItem('sb-${OLD_REF}-auth-token');`,
  ].join('\n');
  const { text: out, changed, refs } = rewriteSupabaseConstants(text, {
    newUrl: NEW_URL, newAnon: anonJwt(NEW_REF), newRef: NEW_REF,
  });
  assert.equal(changed, true);
  assert.deepEqual(refs, [OLD_REF]);
  assert.ok(out.includes(NEW_URL));
  assert.ok(!out.includes(OLD_URL));
  assert.ok(out.includes(anonJwt(NEW_REF)));
  assert.ok(!out.includes(anonJwt(OLD_REF)));
  assert.ok(out.includes(`var ref = '${NEW_REF}'`));
  assert.ok(out.includes(`sb-${NEW_REF}-auth-token`));
  assert.ok(!out.includes(OLD_REF));
});

test('rewriteSupabaseConstants leaves a non-anon JWT untouched', () => {
  const service = serviceJwt(OLD_REF);
  const text = `var SUPA_URL = '${OLD_URL}';\nvar KEY = '${service}';`;
  const { text: out } = rewriteSupabaseConstants(text, {
    newUrl: NEW_URL, newAnon: anonJwt(NEW_REF), newRef: NEW_REF,
  });
  assert.ok(out.includes(service), 'service_role key must not be rewritten');
  assert.ok(out.includes(NEW_URL));
});

test('rewriteSupabaseConstants is idempotent on an already-migrated file', () => {
  const text = `var SUPA_URL = '${NEW_URL}'; var ref = '${NEW_REF}'; var K = '${anonJwt(NEW_REF)}';`;
  const { changed } = rewriteSupabaseConstants(text, {
    newUrl: NEW_URL, newAnon: anonJwt(NEW_REF), newRef: NEW_REF,
  });
  assert.equal(changed, false);
});
