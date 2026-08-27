import globals from 'globals';

// Why this exists
// ---------------
// android-bridge.js is a ~6k-line non-module browser script that replaces every
// server.mjs endpoint the APK cannot run. Nothing type checked or linted it, so
// `node --check` (parse-only) was the entire safety net. That is how
// refreshStoredSessionIfNeeded() shipped: called on the rpcPost() 401 retry path,
// declared nowhere, invisible until it threw ReferenceError on a device and took
// Community down (.agent/KNOWN_ISSUES.md ISSUE-035).
//
// Scope is deliberately narrow — the hand-written bridge/test/script files only.
// www/assets/** is minified upstream output and www/ vendor scripts are not ours;
// linting them would produce noise nobody acts on.
//
// Rules are limited to correctness classes that cause runtime failures. This is
// not a style gate: adding formatting rules to a 6k-line legacy file produces a
// wall of warnings that trains everyone to ignore the linter.

const bridgeGlobals = {
  // Injected by MainActivity's @JavascriptInterface bridge.
  IsotopeAndroid: 'readonly',
  // Capacitor runtime.
  Capacitor: 'readonly',
};

const correctnessRules = {
  // The class of bug that broke Community. Non-negotiable.
  'no-undef': 'error',

  // Silent-failure classes.
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-unreachable': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-obj-calls': 'error',
  'no-sparse-arrays': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-compare-neg-zero': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-template-curly-in-string': 'error',

  // Async correctness — the bridge is almost entirely promise plumbing, and a
  // dropped return is how a failed request silently becomes a resolved one.
  'no-async-promise-executor': 'error',
  'no-promise-executor-return': 'error',
  'require-atomic-updates': 'error',

  // Redeclaration masked a real bug once already: duplicate Qa/Zb declarations in
  // Community-CEnEgsrd.js (commit 323cc8b) were a hard SyntaxError on device.
  'no-redeclare': 'error',

  // An empty catch is how the async-readFile bug stayed hidden for months, but
  // the bridge legitimately uses `catch (e) {}` for best-effort DOM/plugin calls,
  // so require only that the intent is written down.
  'no-empty': ['error', { allowEmptyCatch: true }],

  // Unused vars usually mean a refactor left something behind. Args are noisy in
  // callback-heavy code, so only flag locals.
  'no-unused-vars': ['error', {
    args: 'none',
    caughtErrors: 'none',
    varsIgnorePattern: '^_',
  }],
};

export default [
  // Hand-written Android bridge scripts (non-module, browser).
  {
    files: ['android-bridge.js', 'android-floating-timer-bridge.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...bridgeGlobals },
    },
    rules: correctnessRules,
  },

  // Node-side build/agent scripts (CommonJS + ESM mixed).
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: correctnessRules,
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: correctnessRules,
  },

  // Test suite.
  {
    files: ['test/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: correctnessRules,
  },
];
