#!/usr/bin/env node
/**
 * bake-community-patches.mjs
 * Applied ONCE to committed www assets (no runtime server in APK).
 * Mirrors the serve-time patches isotope-code/server.mjs applies to bundles
 * so community features (real RPC path, group chat, leaderboard, dashboard
 * null-guards, premium gate, Store/Events removal) work in the APK.
 *
 * Idempotent: safe to run repeatedly; each patch is applied only when its
 * anchor string is present and the target text is not already there.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB  = process.env.ISOTOPE_CODE_DIR || '/data/data/com.termux/files/home/isotope-code/public/assets';
const SRC  = join(ROOT, 'www', 'assets');

function load(name) {
  const p = join(SRC, name);
  if (!existsSync(p)) { console.log(`skip (missing): ${name}`); return null; }
  return readFileSync(p, 'utf8');
}
function save(name, s) {
  writeFileSync(join(SRC, name), s);
  console.log(`patched: ${name}`);
}
function apply(file, name, from, to, { all = false, warn = true } = {}) {
  const s = load(file);
  if (s == null) return;
  const contains = all ? s.split(from).length - 1 : s.includes(from);
  if (contains) {
    const out = all ? s.split(from).join(to) : s.replace(from, () => to);
    if (out !== s) save(file, out);
    console.log(`  ${name}: applied${all ? ` (${all === true ? 'all' : contains} occ)` : ''}`);
  } else if (warn) {
    console.log(`  ${name}: ANCHOR NOT FOUND (${from.slice(0, 60)}…)`);
  }
}

// ── 1. communityApi: neutralise premium demo-gate → real RPC path ───────────
apply('communityApi-Ccw5N_9O.js', 'COMMUNITY_API_GATE',
  'import{i as s,s as n}from"./useAuthStore-Aw1au7RF.js"',
  'import{s as n}from"./useAuthStore-Aw1au7RF.js";const s=()=>!1;');

// ── 2. Community bundle (Community-CEnEgsrd.js) crash fixes ─────────────────
apply('Community-CEnEgsrd.js', 'crash: handle.startsWith', 'j.handle.startsWith("student_")', 'j.handle?.startsWith("student_")');
apply('Community-CEnEgsrd.js', 'crash: h.group.subjects', '...h.group.subjects]', '...(h.group.subjects||[])]');
apply('Community-CEnEgsrd.js', 'crash: s.subjects.slice', 's.subjects.slice(0,3)', '(s.subjects||[]).slice(0,3)');
apply('Community-CEnEgsrd.js', 'crash: t.subjects.slice', 't.subjects.slice(0,3)', '(t.subjects||[]).slice(0,3)');
apply('Community-CEnEgsrd.js', 'crash: s.groups.slice', 's.groups.slice(0,3)', '(s.groups||[]).slice(0,3)');
apply('Community-CEnEgsrd.js', 'crash: group.subjects.join', 'P(h.group.subjects.join(", "))', 'P((h.group.subjects||[]).join(", "))');
apply('Community-CEnEgsrd.js', 'crash: d.subjects.length', 'd.subjects.length>0', '(d.subjects||[]).length>0');
apply('Community-CEnEgsrd.js', 'crash: d.subjects.join', 'd.subjects.join(", ")', '(d.subjects||[]).join(", ")');

console.log('Done.');