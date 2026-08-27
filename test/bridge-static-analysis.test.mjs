import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

// android-bridge.js is a single ~6k-line non-module script that is never type
// checked, linted, or bundled — `node --check` only proves it parses. That is how
// `refreshStoredSessionIfNeeded()` shipped: it was called on the rpcPost() 401
// retry path but declared nowhere, so every expired-token Community RPC threw
// ReferenceError at runtime instead of refreshing the session (ISSUE-035).
//
// This walks the AST and asserts every plainly-called identifier resolves to some
// declaration in the file, a known runtime global, or an explicitly allowed
// host-injected name. It is intentionally scope-insensitive: a flat "declared
// anywhere" set can miss a genuine cross-scope bug, but it cannot produce false
// alarms, which keeps the gate trustworthy.

const ROOT = path.resolve(import.meta.dirname, '..');

// Standard globals available in an Android WebView.
const RUNTIME_GLOBALS = new Set([
  // language
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Function',
  'Math', 'JSON', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'ReferenceError', 'EvalError', 'URIError', 'Promise', 'Proxy', 'Reflect',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef',
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'eval',
  'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
  'escape', 'unescape', 'structuredClone', 'queueMicrotask', 'globalThis',
  // timers / scheduling
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback',
  // DOM / BOM
  'window', 'document', 'navigator', 'location', 'history', 'screen',
  'localStorage', 'sessionStorage', 'console', 'alert', 'confirm', 'prompt',
  'Event', 'CustomEvent', 'PopStateEvent', 'KeyboardEvent', 'MouseEvent',
  'MessageEvent', 'ErrorEvent', 'PromiseRejectionEvent', 'StorageEvent',
  'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'Text', 'Comment',
  'NodeFilter', 'NodeIterator', 'TreeWalker', 'MutationObserver',
  'IntersectionObserver', 'ResizeObserver', 'PerformanceObserver',
  'getComputedStyle', 'matchMedia', 'MediaQueryList',
  'Notification', 'Image', 'Audio', 'Option', 'FileReader', 'File', 'Blob',
  'FormData', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'AbortController', 'AbortSignal',
  'fetch', 'Response', 'Request', 'Headers', 'XMLHttpRequest',
  'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'BroadcastChannel',
  'btoa', 'atob', 'crypto', 'performance', 'caches', 'indexedDB',
  'CSS', 'DOMParser', 'XPathResult', 'Storage', 'Selection',
  // Capacitor / test harness injected
  'Capacitor', 'require',
]);

function collectDeclaredNames(ast) {
  const declared = new Set();

  const addPattern = (node) => {
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
      case 'Identifier':
        declared.add(node.name);
        break;
      case 'ObjectPattern':
        for (const prop of node.properties || []) {
          addPattern(prop.type === 'RestElement' ? prop.argument : prop.value);
        }
        break;
      case 'ArrayPattern':
        for (const el of node.elements || []) addPattern(el);
        break;
      case 'AssignmentPattern':
        addPattern(node.left);
        break;
      case 'RestElement':
        addPattern(node.argument);
        break;
      default:
        break;
    }
  };

  walk(ast, (node) => {
    switch (node.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (node.id) declared.add(node.id.name);
        for (const param of node.params || []) addPattern(param);
        break;
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (node.id) declared.add(node.id.name);
        break;
      case 'VariableDeclarator':
        addPattern(node.id);
        break;
      case 'CatchClause':
        if (node.param) addPattern(node.param);
        break;
      // `foo = function(){}` / `foo: function(){}` used as a de-facto declaration
      case 'AssignmentExpression':
        if (node.left.type === 'Identifier') declared.add(node.left.name);
        break;
      case 'Property':
        if (node.key && node.key.type === 'Identifier') declared.add(node.key.name);
        break;
      case 'LabeledStatement':
        if (node.label) declared.add(node.label.name);
        break;
      default:
        break;
    }
  });

  return declared;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

function findUnresolvedCalls(source, filename) {
  const ast = acorn.parse(source, {
    ecmaVersion: 2022,
    sourceType: 'script',
    locations: true,
  });
  const declared = collectDeclaredNames(ast);
  const unresolved = new Map();

  walk(ast, (node) => {
    if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return;
    const callee = node.callee;
    // Only bare `foo(...)`. Member calls (`a.foo()`) resolve at runtime.
    if (!callee || callee.type !== 'Identifier') return;
    const name = callee.name;
    if (declared.has(name) || RUNTIME_GLOBALS.has(name)) return;
    if (!unresolved.has(name)) {
      unresolved.set(name, `${filename}:${node.loc.start.line}`);
    }
  });

  return unresolved;
}

for (const name of ['android-bridge.js', 'android-floating-timer-bridge.js']) {
  test(`${name} calls no undeclared functions`, () => {
    const file = path.join(ROOT, name);
    const unresolved = findUnresolvedCalls(fs.readFileSync(file, 'utf8'), name);
    const report = [...unresolved].map(([fn, at]) => `  ${at} — ${fn}()`).join('\n');
    assert.equal(unresolved.size, 0,
      `${name} calls ${unresolved.size} function(s) that are never declared and ` +
      'are not known runtime globals:\n' + report + '\n' +
      'These throw ReferenceError at runtime; `node --check` cannot catch them. ' +
      'Either implement the function or add a genuine host-injected global to ' +
      'RUNTIME_GLOBALS in this test.');
  });
}

test('the undeclared-call detector actually detects an undeclared call', () => {
  // Without this, a bug in the walker would silently turn the gate above into a
  // no-op that passes forever.
  const unresolved = findUnresolvedCalls(
    'function ok(){ return 1; } function go(){ ok(); definitelyMissing(); }',
    'fixture.js');
  assert.deepEqual([...unresolved.keys()], ['definitelyMissing']);
});

test('the detector does not flag function parameters or callbacks', () => {
  const unresolved = findUnresolvedCalls(
    'function run(fn){ return new Promise(function(resolve){ fn(); resolve(); }); }',
    'fixture.js');
  assert.deepEqual([...unresolved.keys()], []);
});
