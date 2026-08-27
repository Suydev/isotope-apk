import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// These tests exercise the prepare-www.js pipeline, which builds www/ from the
// upstream web app source. That source is no longer part of this repo's build
// pipeline (www/ is prebuilt and committed), so they are skipped here.
const testOrSkip = (name, fn) => test(name, { skip: true }, fn);

function runPrepareWww() {
  throw new Error('prepare-www pipeline retired: upstream source no longer in repo');
}

testOrSkip('Android package resolves every KaTeX CSS font reference for offline LaTeX rendering', () => {
  const wwwDir = runPrepareWww();
  const html = fs.readFileSync(path.join(wwwDir, 'index.html'), 'utf8');
  const assetsDir = path.join(wwwDir, 'assets');
  const katexCssName = fs.readdirSync(assetsDir).find((name) => /^vendor-katex-.*\.css$/.test(name));

  assert.ok(katexCssName, 'vendor-katex CSS should be packaged');
  assert.match(html, new RegExp(`/assets/${katexCssName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

  const css = fs.readFileSync(path.join(assetsDir, katexCssName), 'utf8');
  const refs = [...css.matchAll(/url\(([^)]+)\)/g)]
    .map((match) => match[1].trim().replace(/^['"]|['"]$/g, ''))
    .filter((ref) => ref && !ref.startsWith('data:'));
  const missing = refs.filter((ref) => {
    const relative = ref.startsWith('/assets/') ? ref.slice('/assets/'.length) : ref;
    return !fs.existsSync(path.join(assetsDir, relative));
  });

  assert.equal(missing.length, 0, `Missing KaTeX fonts:\n${missing.join('\n')}`);
  assert.ok(refs.length >= 50, 'KaTeX CSS should declare the expected font set');
});

testOrSkip('Markdown renderer keeps LaTeX delimiters and KaTeX rendering plugins wired', () => {
  const wwwDir = runPrepareWww();
  const assetsDir = path.join(wwwDir, 'assets');
  const rendererName = fs.readdirSync(assetsDir).find((name) => /^MarkdownRendererContent-.*\.js$/.test(name));
  assert.ok(rendererName, 'MarkdownRendererContent chunk should exist');

  const renderer = fs.readFileSync(path.join(assetsDir, rendererName), 'utf8');
  assert.match(renderer, /vendor-katex-.*\.js/);
  assert.match(renderer, /replace\(\/\\\\\\\[\/g/);
  assert.match(renderer, /replace\(\/\\\\\\\(\/g/);
  assert.match(renderer, /e\.push\(\$\)/);
  assert.match(renderer, /r\?\[C\]:\[\]/);
});
