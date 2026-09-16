import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APK = (f) => join(ROOT, f)

// The upstream web app lives in a separate repo, so CI (and any clean checkout)
// will not have it. Resolve it from candidates / $ISOTOPE_CODE_DIR and skip the
// cross-repo assertions rather than failing the build when it is absent.
const UPSTREAM_CANDIDATES = [
  process.env.ISOTOPE_CODE_DIR,
  join(ROOT, '..', 'isotope-code'),
  join(process.env.HOME || '', 'isotope-code'),
  '/tmp/opencode/isotope-code',
]
  .filter(Boolean)
  .map((d) => join(d, 'public', 'assets'))
const UPSTREAM = UPSTREAM_CANDIDATES.find((d) => existsSync(d))
const upstreamSkip = UPSTREAM ? false : 'upstream isotope-code checkout not present'

test('APK: signed-in user on /auth is redirected to /dashboard', () => {
  const s = readFileSync(APK('www/assets/Auth-D0Y8CB1f.js'), 'utf8')
  // Clean early-return guard: when isAuthenticated (s) is true the component
  // navigates to /dashboard via the real useNavigate hook (z) and renders a
  // placeholder instead of the login form.
  assert.match(s, /if\(s\)\{z\("\/dashboard",\{replace:!0\}\);return e\.jsx\("div",\{className:"min-h-screen",children:null\}\);\}const i=z\(\)/)
})

test('APK: AppAccessGate bounces authenticated users away from /onboarding', () => {
  const s = readFileSync(APK('www/assets/AppAccessGate-DzNuNpuU.js'), 'utf8')
  assert.match(s, /if\(s==="private"\)\{if\(y\|\|l\)return r\.jsx\(Y,\{to:"\/dashboard",replace:!0\}\)/)
})

test('upstream: Auth bundle has the same signed-in guard', { skip: upstreamSkip }, () => {
  const p = `${UPSTREAM}/Auth-D0Y8CB1f.js`
  assert.ok(existsSync(p), 'upstream Auth bundle missing')
  const s = readFileSync(p, 'utf8')
  assert.match(s, /if\(s\)\{z\("\/dashboard",\{replace:!0\}\);return e\.jsx\("div",\{className:"min-h-screen",children:null\}\);\}const i=z\(\)/)
})

test('upstream: AppAccessGate has the same onboarding guard', { skip: upstreamSkip }, () => {
  const p = `${UPSTREAM}/AppAccessGate-DzNuNpuU.js`
  assert.ok(existsSync(p), 'upstream gate bundle missing')
  const s = readFileSync(p, 'utf8')
  assert.match(s, /if\(s==="private"\)\{if\(y\|\|l\)return r\.jsx\(Y,\{to:"\/dashboard",replace:!0\}\)/)
})

test('the login form is NOT gated: /auth is still reachable when signed out', () => {
  // The guard must only fire when authenticated (s=true); a signed-out user
  // hits the same code path with s=false and gets the form as before.
  const s = readFileSync(APK('www/assets/Auth-D0Y8CB1f.js'), 'utf8')
  // Confirm the one-tap + form UI is still intact after the guard insertion
  assert.ok(s.includes('google?.accounts?.id'))
  assert.ok(s.includes('Sign In'))
  // And the broken first-attempt guard (lucide icon as Navigate) must be gone
  assert.ok(!s.includes('if(s)return I.jsx(X,{to:"/dashboard",replace:!0})'))
})
