import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_REPO = path.resolve(ROOT, '../isotope-code');

function runPrepareWww() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isotope-www-'));
  const result = spawnSync(process.execPath, ['scripts/prepare-www.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      REPO_DIR: SOURCE_REPO,
      SOURCE_DIR: path.join(SOURCE_REPO, 'public'),
      WWW_DIR: tmp,
      BRIDGE_FILE: path.join(ROOT, 'android-bridge.js'),
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return tmp;
}

function runApplyPatches(wwwDir) {
  const result = spawnSync(process.execPath, ['scripts/apply-android-patches.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      WWW_DIR: wwwDir,
      ANDROID_DIR: path.join(ROOT, 'android-does-not-exist-for-unit-test'),
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

test('prepare-www patches restore-and-launch for legacy onboarding_completed fallback', () => {
  const wwwDir = runPrepareWww();
  const restore = fs.readFileSync(path.join(wwwDir, 'restore-and-launch.js'), 'utf8');

  assert.match(restore, /typeof snapshot\.onboarding_completed === 'boolean'/);
  assert.match(restore, /onboarding: canonicalOnboarding/);
  assert.match(restore, /typeof completed === 'boolean' \? completed : undefined/);
  assert.match(restore, /dbResult !== null && typeof dbResult\.isOnboarded === 'boolean'/);
});

test('apply-android-patches makes Auth login route exactly once from bootstrap', () => {
  const wwwDir = runPrepareWww();
  const output = runApplyPatches(wwwDir);
  assert.match(output, /Patched: Auth bundle/);

  const authFile = fs.readdirSync(path.join(wwwDir, 'assets')).find((name) => /^Auth-.*\.js$/.test(name));
  assert.ok(authFile, 'Auth chunk should exist');
  const auth = fs.readFileSync(path.join(wwwDir, 'assets', authFile), 'utf8');

  assert.match(auth, /window\.__isoLogin/);
  assert.match(auth, /__r\.bootstrap && __r\.bootstrap\.onboarding/);
  assert.match(auth, /Could not verify cloud onboarding state/);
  assert.equal((auth.match(/b\(__completed \? "\/dashboard" : "\/onboarding"/g) || []).length, 1);
  assert.equal(auth.includes('setTimeout(() => {\n                b("/dashboard"'), false);
});
