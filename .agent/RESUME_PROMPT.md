# RESUME PROMPT — Paste this into a new opencode session

You are continuing work on the isotope-apk project. Read these files first:

1. `/data/data/com.termux/files/home/isotope-apk/plan.md` — 7-phase sync plan (Phases 1-6 done, Phase 7 partial)
2. `/data/data/com.termux/files/home/isotope-apk/.agent/CURRENT_STATE.md` — current state
3. `/data/data/com.termux/files/home/isotope-apk/.agent/NEXT_TASKS.md` — task queue
4. `/data/data/com.termux/files/home/isotope-apk/.agent/KNOWN_ISSUES.md` — tracked issues
5. `/data/data/com.termux/files/home/isotope-apk/.agent/CAPACITOR_8_MIGRATION.md` — migration plan
6. `/data/data/com.termux/files/home/isotope-apk/.agent/SESSION_5_CONTEXT.md` — full session context

## Status
- **isotope-apk**: 63/63 tests pass, CI green (Build + Release), APK installed on device
- **isotope-code server.mjs**: Server patches partially fixed (SettingsPatch 7/18, SyncStorePatch updated)
- **Remaining**: Fix AppAccessGatePatch (0/1), AuthPatch (4/7), AppPatch (14 not found), verify SyncStore, commit server.mjs

## Key Discovery
Server.mjs patches use old multi-line formatted strings but bundles are now minified single-line. Many patch targets no longer exist because the bundle was restructured. The pattern is:
- Old: `avatar: void 0` (spaces) → New: `avatar:void 0` (no spaces)
- Old: `label: "Local mode"` → New: `label:"Local mode"`
- Old multiline destructuring → New: `const{status:b,lastSyncAt:N}=Ws()`

## Two repos
- `/data/data/com.termux/files/home/isotope-code` — web app (read-only reference, but server.mjs needs patches)
- `/data/data/com.termux/files/home/isotope-apk` — Android wrapper (editable, CI builds APK)

## Environment
- proot-distro ubuntu for ffmpeg
- Port 4000 stuck, use 4001
- ADB: 10.144.191.140:45931
- Git remote configured with PAT

## Next tasks
1. Fix remaining server patches in isotope-code/server.mjs
2. Verify all patches apply (restart server, check output)
3. Commit and push server.mjs changes
4. Consider ANDROID-012 through ANDROID-017 (device testing)
