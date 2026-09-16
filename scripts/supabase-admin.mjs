#!/usr/bin/env node
/**
 * supabase-admin.mjs — shared Supabase Management-API client.
 *
 * A personal access token (PAT) is the only credential needed. With it this can
 * list projects, read the project's anon/service keys, run SQL, and read/write
 * the auth config — which is everything both the setup and the backend-switch
 * flows need, and none of it is database credentials.
 *
 * Get a token at https://supabase.com/dashboard/account/tokens
 */

'use strict';

const MGMT = 'https://api.supabase.com';
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

export function createAdmin(pat, { gap = 120 } = {}) {
  if (!pat) throw new Error('a personal access token is required');
  let lastCall = 0;

  async function api(route, init = {}, retries = 0) {
    // Reserve the slot before awaiting, or concurrent calls compute their wait
    // from the same stale timestamp and fire together.
    if (retries === 0) {
      const now = Date.now();
      const slot = Math.max(now, lastCall + gap);
      lastCall = slot;
      if (slot > now) await sleep(slot - now);
    }
    const res = await fetch(MGMT + route, {
      ...init,
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && retries < 6) {
      await sleep(500 * 2 ** retries + Math.floor(Math.random() * 300));
      return api(route, init, retries + 1);
    }
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!res.ok) {
      const msg = (body && (body.message || body.error)) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  return {
    api,
    listProjects: () => api('/v1/projects'),
    listOrgs: () => api('/v1/organizations'),
    keys: (ref) => api(`/v1/projects/${ref}/api-keys`),
    query: (ref, sql) => api(`/v1/projects/${ref}/database/query`, {
      method: 'POST', body: JSON.stringify({ query: sql }),
    }),
    getAuthConfig: (ref) => api(`/v1/projects/${ref}/config/auth`),
    patchAuthConfig: (ref, patch) => api(`/v1/projects/${ref}/config/auth`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }),
  };
}

/** The anon or service_role key out of the Management API's api-keys array. */
export function resolveKey(keys, name) {
  return (keys.find((k) => k && k.name === name) || {}).api_key || null;
}
