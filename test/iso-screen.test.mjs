import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'www', 'iso-screen.js'), 'utf8');

// Regression: "TypeError: Illegal invocation" thrown from the bridge's
// MediaQueryList.prototype.addEventListener wrapper, called by Tasks'
// `window.matchMedia("(max-width: 639px)")` change listener.
//
// iso-screen.js used to return `Object.create(mql)` for breakpoint queries.
// That is a chameleon object with no MediaQueryList/EventTarget internal slot,
// so native addEventListener rejects it ("Illegal invocation"). WebViews use
// internal-slot brand checks, which Node's own EventTarget does not emulate —
// so this harness brands instances in a WeakSet, exactly like V8.
function load({ android, width, withVisualViewport = true, phone = false }) {
  const branded = new WeakSet();
  const brandCheck = (self) => {
    if (!branded.has(self)) throw new TypeError('Illegal invocation');
  };

  function MediaQueryList(q) {
    branded.add(this);
    this.media = q;
  }
  MediaQueryList.prototype.addEventListener = function () { brandCheck(this); };
  MediaQueryList.prototype.removeEventListener = function () { brandCheck(this); };
  MediaQueryList.prototype.addListener = function () { brandCheck(this); };
  MediaQueryList.prototype.removeListener = function () { brandCheck(this); };
  Object.defineProperty(MediaQueryList.prototype, 'matches', {
    get() { return false; },
    configurable: true,
  });

  const win = {
    innerWidth: phone ? 400 : width,
    matchMedia(q) { return new MediaQueryList(q); },
  };
  if (withVisualViewport) {
    win.visualViewport = { width: phone ? 400 : width };
  }

  const document = {
    documentElement: {
      classList: { contains: (c) => android && c === 'iso-android' },
    },
  };

  const sandbox = { window: win, document, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'iso-screen.js' });
  return { win, branded };
}

test('iso-screen returns a branded MediaQueryList for breakpoint queries', () => {
  const { win, branded } = load({ android: true, width: 800 });
  const mql = win.matchMedia('(max-width: 639px)');
  assert.ok(branded.has(mql), 'matchMedia returned a chameleon, not a real MediaQueryList');
  assert.doesNotThrow(() => mql.addEventListener('change', () => {}));
  assert.doesNotThrow(() => mql.removeEventListener('change', () => {}));
  assert.equal(mql.matches, false);
});

test('min-width breakpoint queries also stay branded and report PC width', () => {
  const { win, branded } = load({ android: true, width: 800 });
  const mql = win.matchMedia('(min-width: 1024px)');
  assert.ok(branded.has(mql));
  assert.doesNotThrow(() => mql.addEventListener('change', () => {}));
  assert.equal(mql.matches, true);
});

test('non-breakpoint queries pass through untouched', () => {
  const { win, branded } = load({ android: true, width: 800 });
  const mql = win.matchMedia('(prefers-color-scheme: dark)');
  assert.ok(branded.has(mql));
  assert.equal(mql.matches, false);
});

test('phones keep native matchMedia behaviour', () => {
  const { win, branded } = load({ android: true, width: 800, phone: true });
  const mql = win.matchMedia('(max-width: 639px)');
  assert.ok(branded.has(mql));
  assert.equal(mql.matches, false);
});

test('no infinite recursion when visualViewport is unavailable', () => {
  const { win } = load({ android: true, width: 800, withVisualViewport: false });
  assert.equal(win.innerWidth, 1280);
});
