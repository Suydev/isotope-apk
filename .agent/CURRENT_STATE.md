# IsotopeAI Android — Current State

**Updated:** 2026-06-29T11:00:00Z
**Branch:** main (isotope-apk repo)
**Current phase:** ANDROID-006 — Login loop fix: onboarding_completed + webContents debug

---

## What Currently Works

- [x] Capacitor project structure created (package.json, capacitor.config.json)
- [x] android-bridge.js — complete fetch interceptor with all /__auth/* handlers
- [x] scripts/prepare-www.js — copies public/ to www/, injects bridge, patches sw.js
- [x] scripts/apply-android-patches.js — patches App bundle, sessionSync, AppAccessGate
- [x] .github/workflows/android.yml — full debug APK CI pipeline
- [x] AGENTS.md handoff system created
- [x] All .agent/ documentation files populated with real subagent-verified data
- [x] agent-resume.sh, agent-handoff.sh, agent-status.mjs created

## What Is Partially Implemented

- [ ] android-bridge.js `handleGetBestBackup()` — scans storage list but simplified vs server.mjs (which scans 4 folder paths). Currently only checks backup_manifests table. **May miss some backup files.**
- [ ] android-bridge.js `handleBootstrap()` — returns profile but missing `best_backup`, `backup_candidates`, `restore_recommended` fields that server.mjs returns. These are used by AppAccessGate to trigger restore flow.
- [ ] apply-android-patches.js patch strings — written against known bundle patterns from subagent analysis but NOT yet verified against actual bundle content (can only be verified after prepare-www runs)

## What Is Broken

- Nothing is confirmed broken yet — APK has not been built
- The GitHub Actions workflow references `isotope-code` repo — ensure that repo is public or the `github.token` has access

## What Has Not Started

- Native Android notification scheduling (ANDROID-008)
- WAV → OGG sound conversion (ANDROID-007)
- @capacitor/filesystem for file export (ANDROID-009)
- WorkManager background timer (ANDROID-010)
- Physical device testing

## Last Successful Build

- None yet — first build to be triggered by pushing to GitHub

## Last Successful APK Path

- None yet

## Current Blocking Issue

Files need to be pushed to GitHub repository. All files are locally prepared at:
`/home/runner/isotope-apk-build/`

The push uses GitHub Git Data API (blobs → tree → commit → ref update) since
destructive git operations are blocked in the Replit main agent.

## Important Modified Files (not yet pushed)

- `android-bridge.js` — core fetch interceptor
- `scripts/prepare-www.js` — www/ preparation
- `scripts/apply-android-patches.js` — bundle patcher
- `scripts/agent-resume.sh` — resume helper
- `scripts/agent-handoff.sh` — handoff helper
- `scripts/agent-status.mjs` — status reporter
- `.github/workflows/android.yml` — CI pipeline
- `capacitor.config.json` — Capacitor config
- `package.json` — dependencies
- `AGENTS.md` — agent instructions
- `.agent/**` — all handoff files

## Changes Committed: NO
## Changes Pushed: NO
## Working Tree Clean: NO (all files to be pushed via GitHub API)

## Exact Next Command

```bash
# Run the GitHub API push script to publish all files
node scripts/push-to-github.js

# Then verify the push worked:
# https://github.com/Suydev/isotope-apk
# https://github.com/Suydev/isotope-apk/actions
```
