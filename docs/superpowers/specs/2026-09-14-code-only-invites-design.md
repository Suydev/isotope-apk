# Code-Only Invites (Buddy + Group) — Design

Date: 2026-09-14
Repos: `isotope-apk` (Capacitor APK), `isotope-code` (upstream web)

## Problem

The APK's Community invites are shareable links of the form
`${window.location.origin}/invite/<code>`. Inside the APK that origin is a
WebView-local value, so the copied link is unusable. Users cannot add buddies or
join groups.

Three independent defects:

1. `community_get_overview` returns `stats/groups/buddies/groupRequests` but no
   `profile`. The bundle reads `b.data?.profile?.user_id` for `ownUserId`, so
   `ownUserId` is always `undefined` and the buddy "generate invite" handler
   early-returns (`if(!i)return;`) — a silent no-op.
2. `communityApi.createInvite` wraps the backend's 8-char code as
   `${origin}/invite/<code>`, which is unusable in the APK.
3. The dialog component `B` restores focus to the element that was focused when
   the dialog opened, but its effect depends on the inline `onClose` prop, which
   changes on every parent render. Each keystroke triggers a render → effect
   re-run → cleanup `m?.focus()` steals focus from the input and the soft
   keyboard closes. Group chat is unaffected because it is not rendered inside
   `B`.

The backend is already code-based: `community_create_invite(type,target,days)`
returns an 8-char code; `community_preview_invite(token)` and
`community_redeem_invite(token)` take a code. No server invite logic needs to
change — only presentation and one overview field.

## Goals

- Invites are codes only. No invite links are produced or shown anywhere in the
  APK.
- Generate a code: buddy popup (your own code) and group settings popup (group
  code). The code is displayed and copyable.
- Enter a code: buddy popup (add a buddy) and Groups tab (join a group).
- UI must match the existing Community design system (same dialog `B`, same
  `community-*` classes, same input styling as the username field).

## Non-Goals

- No changes to the web `/invite/:token` route. It still works and accepts a
  typed code, so codes remain cross-compatible.
- No work on orphaned bundles (`GroupInviteGenerator-B-iMSSXc`,
  `useInvites-D9RLFwf8`); they are unreachable from the entry graph.
- No code expiration/rotation policy changes (`max_uses=1`, 7 days, unchanged).

## Design

### 1. Database — `supabase/025_overview_profile.sql`

`CREATE OR REPLACE FUNCTION community_get_overview()` adds to its result object:

- `profile`: `{ user_id, handle, display_name, avatarUrl }` for `auth.uid()`
  (object, never null).
- `pendingCount`: number of incoming pending buddy requests + incoming pending
  group join requests.
- `updatedAt`: `now()`.

`profile.user_id` is what makes buddy code generation work. `pendingCount` and
`updatedAt` are read by the bundle already (badge + freshness line) and are
currently always missing. Idempotent, no DROP.

### 2. `www/assets/communityApi-Ccw5N_9O.js`

- `createInvite`: return the raw code. `data: \`${origin}/invite/${t}\`` → `data: t`.
- Before `export{g as c}`, expose the client: `window.__isoCommunityApi=g;`
  (lets the code-entry handlers call `previewInvite`/`redeemInvite` without
  another bundle patch).

### 3. `www/assets/useCommunity-CBDFEeBe.js`

Add a mutation next to `createInvite`:

```
redeemInvite:o({mutationFn:({token:e})=>r.redeemInvite(e),onSuccess:i})
```

`i` is the existing success hook that invalidates all `community-v2` queries
except `enrollment`, so the buddy/group lists refresh automatically.

### 4. `www/assets/Community-CEnEgsrd.js`

- **Keyboard fix (done):** cleanup only refocuses `m` when the dialog's section
  is disconnected (real unmount), not on effect re-runs.
- **Buddy popup `as`:**
  - Add state for the typed code.
  - Add an "Enter a code" input + Join button. Join calls
    `x.redeemInvite.mutateAsync({token})`, shows success and closes; maps
    `invite_invalid` / `invite_blocked` to friendly text.
  - Rename "Copy private invite link" → "Generate buddy code"; the code is
    displayed as text (auto-copied).
  - Description updated to mention codes.
- **Groups tab `es`:**
  - Add an "Enter code" button next to "Create group".
  - Opens dialog `B` with a code input + Join button calling
    `redeemInvite`; on success the group list refreshes via the mutation hook.
- **Group settings popup `ts`:** generation wording changes from "Invite link
  copied." to "Invite code copied."; the stored/copied value is the code.

### 5. Upstream parity — `isotope-code/server.mjs`

Mirror patches 2–4 inside `getPatchedCommunityBundle()` /
`getPatchedCommunityApiBundle()` so a serve-time capture reproduces the same
behaviour, and apply the new migration to the upstream schema file.

### 6. Tests — `test/baked-patches.test.mjs`

Assert, on the baked bundles:

- `communityApi` contains `data:t` for `createInvite` and exposes
  `__isoCommunityApi`.
- `useCommunity` contains `redeemInvite:`.
- `Community` contains the code-entry anchors, the absence of
  `${window.location.origin}/invite/`, and the focus-restore guard.

Plus the existing syntax gate over all `www` JS.

## Data Flow

- Generate: popup → `communityApi.createInvite(type,target)` → RPC
  `community_create_invite` → returns code → shown + copied.
- Enter: input → `useCommunity.redeemInvite({token})` →
  `communityApi.redeemInvite(token)` → RPC `community_redeem_invite` →
  `{status:'joined'}` → community queries invalidated → lists refresh.

## Error Handling

`communityApi` already converts thrown Postgres errors to `{success:false,error}`.
The handlers map known error strings and fall back to the raw message:

- `invite_invalid` → "That code isn't valid or has expired."
- `invite_blocked` → "You can't join this person's circle."
- otherwise → the returned message.

Empty/whitespace input disables the Join button; input is trimmed and
lowercased before the call.

## Risks

- Minified-React patches are anchored string replacements; each new anchor gets a
  regression test and `node --check`. The root bridge copies are unaffected by
  this change (no bridge edits), so the CI bridge-identity gate is not at risk.
