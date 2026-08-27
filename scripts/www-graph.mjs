#!/usr/bin/env node
/**
 * www-graph.mjs — resolve the set of www/assets bundles the app can actually load.
 *
 * Why this exists
 * ---------------
 * www/assets contains 162 JS bundles, but only ~122 are reachable from the entry
 * script in index.html. The rest are leftovers from older builds: same module
 * names, different content hashes. That matters because a "verified" patch anchor
 * in an unreachable bundle proves nothing about the running app — e.g. the
 * `p_code` invite patch and the `remains pending` sync-queue patch both lived in
 * orphaned files (useInvites-D9RLFwf8, sessionSync-mloIEnTd) while the live
 * invite path uses `p_token` via communityApi.
 *
 * Reachability is computed the way the WebView resolves modules:
 *   index.html <script type=module src=...>  (the entry)
 *   + static  `from"./X.js"` / `import"./X.js"`
 *   + dynamic `import("./X.js")`
 *   + any `/assets/X.js` string
 *
 * Exported for tests; run directly for a report.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');
const ASSETS = path.join(WWW, 'assets');

/** Entry bundles referenced directly by index.html. */
export function entryBundles(html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8')) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="\/assets\/([A-Za-z0-9_.-]+\.js)"/g)) {
    out.add(m[1]);
  }
  return [...out];
}

const REF_PATTERNS = [
  /["'`]\.\/([A-Za-z0-9_.-]+\.js)["'`]/g,   // ./Chunk.js  (static + dynamic)
  /["'`]\/assets\/([A-Za-z0-9_.-]+\.js)["'`]/g, // /assets/Chunk.js
];

/**
 * @returns {{reachable:Set<string>, orphaned:string[], missing:string[]}}
 */
export function resolveGraph() {
  const all = fs.readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
  const reachable = new Set();
  const missing = [];
  const queue = entryBundles();

  while (queue.length) {
    const name = queue.shift();
    if (reachable.has(name)) continue;
    reachable.add(name);
    const file = path.join(ASSETS, name);
    if (!fs.existsSync(file)) {
      missing.push(name);
      continue;
    }
    const src = fs.readFileSync(file, 'utf8');
    for (const re of REF_PATTERNS) {
      for (const m of src.matchAll(re)) queue.push(m[1]);
    }
  }

  return {
    reachable,
    orphaned: all.filter((f) => !reachable.has(f)).sort(),
    missing,
  };
}

/** True if `name` is loadable by the shipped app. */
export function isReachable(name) {
  return resolveGraph().reachable.has(name);
}

/** First reachable bundle containing `needle`, or null. */
export function findReachableContaining(needle) {
  const { reachable } = resolveGraph();
  for (const name of reachable) {
    const file = path.join(ASSETS, name);
    if (!fs.existsSync(file)) continue;
    if (fs.readFileSync(file, 'utf8').includes(needle)) return name;
  }
  return null;
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const { reachable, orphaned, missing } = resolveGraph();
  const bytes = orphaned.reduce((n, f) => n + fs.statSync(path.join(ASSETS, f)).size, 0);
  console.log(`entry     : ${entryBundles().join(', ')}`);
  console.log(`reachable : ${reachable.size}`);
  console.log(`orphaned  : ${orphaned.length} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
  if (missing.length) {
    console.error(`\n✗ referenced but MISSING (${missing.length}) — these are broken imports:`);
    missing.forEach((f) => console.error(`    ${f}`));
    process.exit(1);
  }
  if (process.argv.includes('--list-orphans')) {
    console.log('\norphaned bundles:');
    orphaned.forEach((f) => console.log(`    ${f}`));
  }
  console.log('\n✓ every referenced bundle exists');
}
