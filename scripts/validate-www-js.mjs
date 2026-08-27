#!/usr/bin/env node
/**
 * validate-www-js.mjs — parse every JS file under www/ the way the WebView will.
 *
 * Why this is not `node --check`:
 *   `node --check <file>` parses as a CommonJS *script*. The app's bundles are ES
 *   *modules*, and script-mode parsing accepts things module-mode rejects. Two
 *   committed stubs (EventsCalendar-COHF8nOK.js, FocusStore-D5cRXSIr.js) ended in
 *   a literal backslash-n instead of a newline; `node --check` passed them for
 *   months while the WebView would have thrown
 *   "SyntaxError: Invalid or unexpected token" the moment either was imported.
 *
 * Bundles are classified by content: anything using import/export syntax is
 * parsed as a module, everything else (classic scripts like android-bridge.js,
 * sw.js, vendor globals) as a script.
 *
 * Exit code 1 with a file list on any failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

// Module syntax at statement level. Deliberately conservative: a false "module"
// verdict only makes the check stricter, never looser.
const MODULE_SYNTAX = /(^|[\n;}])\s*(import\s*[{*'"(\w]|export\s*(\{|\*|default|const|let|var|function|class|async))/;

export function classify(source) {
  return MODULE_SYNTAX.test(source) ? 'module' : 'script';
}

export function validateFile(file, source) {
  const sourceType = classify(source);
  try {
    acorn.parse(source, { ecmaVersion: 2022, sourceType, allowHashBang: true });
    return null;
  } catch (err) {
    // A file that fails as a script may legitimately be a module (top-level
    // await, `import.meta`) — retry before reporting.
    if (sourceType === 'script') {
      try {
        acorn.parse(source, { ecmaVersion: 2022, sourceType: 'module', allowHashBang: true });
        return null;
      } catch { /* fall through to report the module error below */ }
    }
    return { file, sourceType, message: err.message };
  }
}

export function validateAll(rootDir = WWW) {
  return walk(rootDir)
    .map((file) => validateFile(file, fs.readFileSync(file, 'utf8')))
    .filter(Boolean);
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  if (!fs.existsSync(WWW)) {
    console.error(`ERROR: www/ not found at ${WWW}`);
    process.exit(1);
  }
  const failures = validateAll();
  const total = walk(WWW).length;
  if (failures.length) {
    console.error(`\n✗ ${failures.length} of ${total} www/ JS file(s) will not parse in the WebView:\n`);
    for (const f of failures) {
      console.error(`  ${path.relative(ROOT, f.file)}`);
      console.error(`    parsed as ${f.sourceType}: ${f.message}`);
    }
    console.error('\nThese throw SyntaxError at runtime. `node --check` does not catch');
    console.error('module-only errors — restore the file from git or re-bake the patch.\n');
    process.exit(1);
  }
  console.log(`✓ All ${total} www/ JS files parse cleanly (module + script modes)`);
}
