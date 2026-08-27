#!/usr/bin/env node
/**
 * supabase-config.js — single source of truth for Supabase connection values.
 *
 * Resolution precedence (highest first):
 *   1. Process env:      SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_PROJECT_REF
 *   2. Root .env file:   same variable names (manual parse, no dependencies)
 *   3. supabase.config.json (committed defaults — the current prod project)
 *
 * projectRef is derived from SUPABASE_URL when not set explicitly.
 * All values here are PUBLIC (URL + anon key are shipped in the client).
 * Service-role keys / PATs must never be added to this file.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Path resolution lives in _paths() so tests can re-read the env vars per call;
// two module-level CONFIG_PATH/ENV_PATH constants used to shadow-duplicate it here
// and were dead (they captured process.env once, at require time).

function parseDotEnv(content) {
  const out = {};
  for (const line of String(content || '').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

function _paths() {
  return {
    config: process.env.SUPA_CONFIG_PATH || path.resolve(__dirname, '..', 'supabase.config.json'),
    env:    process.env.SUPA_ENV_PATH   || path.resolve(__dirname, '..', '.env'),
  };
}

function loadConfig() {
  const { config: CONFIG_PATH, env: ENV_PATH } = _paths();
  const fileConfig = fs.existsSync(CONFIG_PATH)
    ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    : {};

  let dotEnv = {};
  if (fs.existsSync(ENV_PATH)) {
    try { dotEnv = parseDotEnv(fs.readFileSync(ENV_PATH, 'utf8')); } catch (_) {}
  }

  const env = process.env;
  const url  = env.SUPABASE_URL  || dotEnv.SUPABASE_URL  || fileConfig.url  || '';
  const anon = env.SUPABASE_ANON_KEY || dotEnv.SUPABASE_ANON_KEY || fileConfig.anonKey || '';
  const ref  = env.SUPABASE_PROJECT_REF || dotEnv.SUPABASE_PROJECT_REF || fileConfig.projectRef ||
               (url.match(/^https?:\/\/([^.]+)\.supabase\.co/) || [])[1] || '';

  return {
    url,
    anonKey: anon,
    projectRef: ref,
    source: {
      url:  env.SUPABASE_URL ? 'env' : dotEnv.SUPABASE_URL ? '.env' : fileConfig.url ? 'config.json' : 'none',
      anonKey: env.SUPABASE_ANON_KEY ? 'env' : dotEnv.SUPABASE_ANON_KEY ? '.env' : fileConfig.anonKey ? 'config.json' : 'none',
      projectRef: env.SUPABASE_PROJECT_REF ? 'env' : dotEnv.SUPABASE_PROJECT_REF ? '.env' : fileConfig.projectRef ? 'config.json' : 'derived',
    },
  };
}

module.exports = { loadConfig, parseDotEnv };

if (require.main === module) {
  const cfg = loadConfig();
  console.log(JSON.stringify(cfg, null, 2));
}
