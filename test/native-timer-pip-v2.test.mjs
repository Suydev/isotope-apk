import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_REPO = path.resolve(ROOT, '../isotope-code');

function runPrepareWww() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isotope-pip-v2-www-'));
  const result = spawnSync(process.execPath, ['scripts/prepare-www.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      REPO_DIR: SOURCE_REPO,
      SOURCE_DIR: path.join(SOURCE_REPO, 'public'),
      WWW_DIR: tmp,
      BRIDGE_FILE: path.join(ROOT, 'android-bridge.js'),
      PIP_BRIDGE_FILE: path.join(ROOT, 'android-pip-bridge.js'),
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return tmp;
}

test('prepare-www packages compact Android timer PiP after the main bridge', () => {
  const wwwDir = runPrepareWww();
  const html = fs.readFileSync(path.join(wwwDir, 'index.html'), 'utf8');
  const pipBridge = fs.readFileSync(path.join(wwwDir, 'android-pip-bridge.js'), 'utf8');

  assert.ok(html.includes('/android-bridge.js'));
  assert.ok(html.includes('/android-pip-bridge.js'));
  assert.ok(html.indexOf('/android-bridge.js') < html.indexOf('/android-pip-bridge.js'));
  assert.match(pipBridge, /documentPictureInPicture/);
  assert.match(pipBridge, /__ISO_ANDROID_TIMER_PIP__/);
  assert.match(pipBridge, /enterFocusPipWithSize/);
  assert.match(pipBridge, /compactRenderer/);
});

test('native Android activity exposes compact timer PiP and result actions', () => {
  const activity = fs.readFileSync(
    path.join(ROOT, 'android/app/src/main/java/in/isotopeai/app/MainActivity.java'),
    'utf8',
  );
  const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const correct = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/drawable/ic_pip_correct.xml'), 'utf8');
  const incorrect = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/drawable/ic_pip_incorrect.xml'), 'utf8');
  const skip = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/drawable/ic_pip_skip.xml'), 'utf8');

  assert.match(manifest, /android:supportsPictureInPicture="true"/);
  assert.match(activity, /public void onStart\(\)/);
  assert.match(activity, /public void onDestroy\(\)/);
  assert.doesNotMatch(activity, /protected void onStart\(\)/);
  assert.doesNotMatch(activity, /protected void onDestroy\(\)/);
  assert.match(activity, /enterFocusPipWithSize/);
  assert.match(activity, /setAspectRatio\(safeAspectRatio\(width, height\)\)/);
  assert.match(activity, /setActions\(buildPipActions\(\)\)/);
  assert.match(activity, /__ISO_ANDROID_TIMER_PIP__/);
  assert.match(activity, /Context\.RECEIVER_NOT_EXPORTED/);
  assert.match(correct, /FFFFFFFF/);
  assert.match(incorrect, /FFFFFFFF/);
  assert.match(skip, /FFFFFFFF/);
});
