
     Sync Engine, Cloud Backup & Data Sync Analysis Report

     Codebase: /data/data/com.termux/files/home/isotope-apk/www/

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     1. Sync Engine Implementation

     Status: No centralized "Er class" or batchUpsert found. Sync logic is distributed.

     ┌──────────────────────┬─────────────────────────────┬──────────────┬────────────────────────────────────────────────────────────────┐
     │Component             │File                         │Lines         │Handles                                                         │
     ├──────────────────────┼─────────────────────────────┼──────────────┼────────────────────────────────────────────────────────────────┤
     │Main Sync Orchestrator│android-bridge.js            │2705–3170     │runManualCloudSyncCompat(), downloadAndImportBackupCompat(),    │
     │                      │                             │              │uploadBackupJsonCompat(), downloadBackupJsonCompat(),           │
     │                      │                             │              │refreshCloudSnapshotCompat()                                    │
     ├──────────────────────┼─────────────────────────────┼──────────────┼────────────────────────────────────────────────────────────────┤
     │Local Data Adapter    │sync/local-data-adapter.js   │332–353       │buildBackupPayloadFromLocal(), applyBackupToLocal(),            │
     │                      │                             │              │readAllLocalData(), writeAllLocalData()                         │
     ├──────────────────────┼─────────────────────────────┼──────────────┼────────────────────────────────────────────────────────────────┤
     │Backup Normalizer     │sync/backup-normalizer.js    │366–394       │buildCanonicalBackupPayload(), buildCloudSnapshotMirror()       │
     ├──────────────────────┼─────────────────────────────┼──────────────┼────────────────────────────────────────────────────────────────┤
     │React Sync Store      │assets/useSyncStore-Di0wBMnH.│1–2 (minified)│Zustand store exposing syncEngine with fullManualSync(),        │
     │                      │js                           │              │downloadCloudSnapshot()                                         │
     ├──────────────────────┼─────────────────────────────┼──────────────┼────────────────────────────────────────────────────────────────┤
     │Smart Size Decisions  │sync-size-optimizer.js       │46–376        │decideSyncStrategy(), analyzeSyncBatch(), executeSmartSync()    │
     └──────────────────────┴─────────────────────────────┴──────────────┴────────────────────────────────────────────────────────────────┘

     What's Missing:

     - ❌ No Er class (the name may be a minified/bundled reference)
     - ❌ No batchUpsert function
     - ❌ No explicit pull() / push() methods — sync is implemented as high-level operations (runManualCloudSync, downloadAndImportBackup,
       etc.)
 - ❌ No delta/differential sync — only full backup upload/download with merge

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     2. Cloud Backup / Snapshot Logic

     ┌─────────────────────────────┬─────────────────────────┬─────────┬──────────────────────────────────────────────────────────────────┐
     │Function                     │File                     │Lines    │Purpose                                                           │
     ├─────────────────────────────┼─────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────┤
     │writeCanonicalBackup()       │android-bridge.js        │1437–1507│Uploads canonical backup to user-content/{userId}/backups/latest. │
     │                             │                         │         │json + history + cloud-snapshot mirror                            │
     ├─────────────────────────────┼─────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────┤
     │buildCanonicalBackupPayload()│sync/backup-normalizer.js│366–375  │Creates versioned backup payload {version: 1, source: 'isotopeai',│
     │                             │                         │         │ exportedAt, appVersion, data}                                    │
     ├─────────────────────────────┼─────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────┤
     │buildCloudSnapshotMirror()   │sync/backup-normalizer.js│377–394  │Creates Supabase-compatible snapshot with schema_version: 1,      │
     │                             │                         │         │trusted flag                                                      │
     ├─────────────────────────────┼─────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────┤
     │findBestCloudBackup()        │android-bridge.js        │1091–1148│Scans storage paths (backups, imports, exports, cloud-snapshot)   │
     │                             │                         │         │and selects richest valid backup                                  │
     ├─────────────────────────────┼─────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────┤
     │downloadCloudSnapshot()      │android-bridge.js        │1150–1155│Downloads cloud-snapshot/latest.json                              │
     ├─────────────────────────────┼─────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────┤
     │handleUploadBackup()         │android-bridge.js        │1956–2079│POST /__auth/backup — validates, merges if cloud richer, writes   │
     │                             │                         │         │canonical + manifest + cleanup                                    │
     ├─────────────────────────────┼─────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────┤
     │handleGetLatestBackup()      │android-bridge.js        │2082–2126│GET /__auth/backup/latest — returns best available backup JSON    │
     ├─────────────────────────────┼─────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────┤
     │handleGetBestBackup()        │android-bridge.js        │2129–2159│GET /__auth/backup/best — returns richest backup for restore      │
     │                             │                         │         │decisions                                                         │
     ├─────────────────────────────┼─────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────┤
     │handleSnapshot()             │android-bridge.js        │2353–2387│POST /__auth/snapshot — triggers local adapter snapshot upload    │
     └─────────────────────────────┴─────────────────────────┴─────────┴──────────────────────────────────────────────────────────────────┘



     Storage Structure:

     user-content/
       {userId}/
         backups/
           latest.json              → canonical backup (primary)
           history/{timestamp}-{hash}.json  → versioned history (keep 5)
         cloud-snapshot/
           latest.json              → Supabase mirror (schema_version: 1)
         imports/
           latest.json + archives   → manual imports
         exports/
           latest.json + archives   → manual exports

     What's Missing:

     - ❌ No incremental/differential backup — always full payload
     - ❌ No backup encryption at rest (stored as plain JSON in Supabase Storage)
     - ❌ No automatic scheduled backup — only manual/triggered

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     3. Conflict Resolution

     ┌─────────────────────┬─────────────────────────┬───────┬────────────────────────────────────────────────────────────────────────────┐
     │Function             │File                     │Lines  │Strategy                                                                    │
     ├─────────────────────┼─────────────────────────┼───────┼────────────────────────────────────────────────────────────────────────────┤
     │mergeById()          │sync/backup-normalizer.js│304–327│Last-write-wins by updatedAt/updated_at/lastModified/createdAt — merges     │
     │                     │                         │       │fields, keeps newer timestamp                                               │
     ├─────────────────────┼─────────────────────────┼───────┼────────────────────────────────────────────────────────────────────────────┤
     │mergeById()          │android-bridge.js        │850–868│Same logic (duplicated)                                                     │
     ├─────────────────────┼─────────────────────────┼───────┼────────────────────────────────────────────────────────────────────────────┤
     │mergeBackupData()    │sync/backup-normalizer.js│346–364│Profile: nonEmptyObjectMerge (overlay wins for non-null/non-empty). Arrays: │
     │                     │                         │       │mergeById. TimerState: newer timestamp wins                                 │
     ├─────────────────────┼─────────────────────────┼───────┼────────────────────────────────────────────────────────────────────────────┤
     │mergeBackupData()    │android-bridge.js        │917–938│Same logic (duplicated)                                                     │
     ├─────────────────────┼─────────────────────────┼───────┼────────────────────────────────────────────────────────────────────────────┤
     │nonEmptyObjectMerge()│sync/backup-normalizer.js│329–344│Deep merge: overlay values win unless null/empty string AND key not in base │
     ├─────────────────────┼─────────────────────────┼───────┼────────────────────────────────────────────────────────────────────────────┤
     │mergeObjects()       │android-bridge.js        │870–880│Similar to nonEmptyObjectMerge                                              │
     └─────────────────────┴─────────────────────────┴───────┴────────────────────────────────────────────────────────────────────────────┘

     Applied to Collections: tasks, sessions, subjects, habits, dailyLogs, tests, exams, mockTests

     What's Missing:

     - ❌ No mergeSubjects function — subjects use generic mergeById
     - ❌ No mergeChapters function — chapters are nested inside subjects, merged as part of subject object
     - ❌ No field-level conflict resolution (e.g., merge arrays by concatenation, take max of numbers)
     - ❌ No user-facing conflict UI — resolution is automatic, silent
     - ❌ No CRDT or operational transform — simple timestamp-based LWW

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     4. Offline-First Strategy

     ┌──────────────────────┬──────────────────────────┬────────────────┬─────────────────────────────────────────────────────────────────┐
     │Mechanism             │File                      │Lines           │Description                                                      │
     ├──────────────────────┼──────────────────────────┼────────────────┼─────────────────────────────────────────────────────────────────┤
     │Boot State Machine    │restore-and-launch.js     │50–58, 787–850  │BOOT_STATES.OFFLINE_CACHED — boots from trusted cloud snapshot   │
     │                      │                          │                │when DB unreachable                                              │
     ├──────────────────────┼──────────────────────────┼────────────────┼─────────────────────────────────────────────────────────────────┤
     │Trusted Cloud Snapshot│restore-and-launch.js     │486–528         │readTrustedCloudSnapshot() — validates source === 'supabase' &&  │
     │                      │                          │                │trusted === true && onboarding.completed boolean                 │
     ├──────────────────────┼──────────────────────────┼────────────────┼─────────────────────────────────────────────────────────────────┤
     │Cached Bootstrap Apply│restore-and-launch.js     │530–557         │applyCachedCloudSnapshot() — writes profile, onboarding, stats   │
     │                      │                          │                │to localStorage for offline render                               │
     ├──────────────────────┼──────────────────────────┼────────────────┼─────────────────────────────────────────────────────────────────┤
     │Network Detection     │pwa-local.js              │8–13, 147–165   │Tracks browserOnline + serverOnline (pings /api/version), shows  │
     │                      │                          │                │offline banner                                                   │
     ├──────────────────────┼──────────────────────────┼────────────────┼─────────────────────────────────────────────────────────────────┤
     │Android Bridge Network│android-bridge.js         │247–266, 386–425│setNativeOnline(), Capacitor Network plugin listener, navigator. │
     │                      │                          │                │onLine override                                                  │
     ├──────────────────────┼──────────────────────────┼────────────────┼─────────────────────────────────────────────────────────────────┤
     │Service Worker        │sw.js + workbox-*.js      │—               │Network-first for navigation, stale-while-revalidate for assets  │
     ├──────────────────────┼──────────────────────────┼────────────────┼─────────────────────────────────────────────────────────────────┤
     │Sync Locks            │android-bridge.js         │2705–2781       │withSyncLock() prevents concurrent sync operations               │
     ├──────────────────────┼──────────────────────────┼────────────────┼─────────────────────────────────────────────────────────────────┤
     │Local-First Writes    │sync/local-data-adapter.js│194–227         │All writes go to IndexedDB + localStorage first; cloud sync is   │
     │                      │                          │                │async background                                                 │
     └──────────────────────┴──────────────────────────┴────────────────┴─────────────────────────────────────────────────────────────────┘

     What's Missing:

     - ❌ No background sync queue / outbox for mutations made offline
     - ❌ No conflict detection UI when coming back online
     - ❌ No automatic sync on network restore (only visibility-change triggered server check)
     - ❌ No optimistic UI updates with rollback capability

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     5. Omitted Columns / Adaptive Columns Logic

     Status: NOT FOUND

     ┌──────────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────┐
     │Search Pattern                                                        │Result                                                       │
     ├──────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
     │omittedColumn / omitted_columns                                       │❌ No matches                                                │
     ├──────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
     │adaptiveColumn / adaptive_columns                                     │❌ No matches                                                │
     ├──────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
     │column + omit / exclude                                               │❌ No relevant matches                                       │
     ├──────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
     │select + column filtering in sync                                     │❌ Full object sync only                                     │
     └──────────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────┘

     What This Means:

     - All fields of all records are synced — no column/field filtering
     - No adaptive payload sizing based on network conditions (only whole-collection size decisions in sync-size-optimizer.js)
     - No "lightweight" sync mode for slow connections

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     Summary: What's Missing vs. Typical Sync Engine Expectations

     ┌─────────────────────────────────────────────────┬───────────────────────┬──────────────────────────────────────────────────────────┐
     │Expected Feature                                 │Status                 │Notes                                                     │
     ├─────────────────────────────────────────────────┼───────────────────────┼──────────────────────────────────────────────────────────┤
     │Centralized SyncEngine class                     │❌                     │Distributed across bridge, adapter, store                 │
     ├─────────────────────────────────────────────────┼───────────────────────┼──────────────────────────────────────────────────────────┤
     │batchUpsert for bulk writes                      │❌                     │Uses store.put() in loops                                 │
     ├─────────────────────────────────────────────────┼───────────────────────┼──────────────────────────────────────────────────────────┤
     │pull() / push() methods                          │❌                     │High-level runManualCloudSync() only                      │
     ├─────────────────────────────────────────────────┼───────────────────────┼──────────────────────────────────────────────────────────┤
     │Delta sync / incremental                         │❌                     │Full backup each time                                     │
     ├─────────────────────────────────────────────────┼───────────────────────┼──────────────────────────────────────────────────────────┤
     │mergeSubjects, mergeChapters                     │❌                     │Generic mergeById only                                    │
     ├─────────────────────────────────────────────────┼───────────────────────┼──────────────────────────────────────────────────────────┤
     │Field-level conflict resolution                  │❌                     │Object-level LWW only                                     │
     ├─────────────────────────────────────────────────┼───────────────────────┼──────────────────────────────────────────────────────────┤
     │Outbox/background queue                          │❌                     │No offline mutation queue                                 │
     ├─────────────────────────────────────────────────┼───────────────────────┼──────────────────────────────────────────────────────────┤
     │Adaptive/omitted columns                         │❌                     │Full object sync                                          │
     ├─────────────────────────────────────────────────┼───────────────────────┼──────────────────────────────────────────────────────────┤
     │Automatic sync scheduling                        │❌                     │Manual/user-triggered only                                │
     ├─────────────────────────────────────────────────┼───────────────────────┼──────────────────────────────────────────────────────────┤
     │Encryption at rest (cloud)                       │❌                     │Plain JSON in Supabase Storage                            │
     └─────────────────────────────────────────────────┴───────────────────────┴──────────────────────────────────────────────────────────┘

     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     Key Files Reference
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     Key Files Reference

     ┌──────────────────────────────────────────┬────────────────────┬────────────────────────────────────────────────────────────────────┐
     │File                                      │Size                │Role                                                                │
     ├──────────────────────────────────────────┼────────────────────┼────────────────────────────────────────────────────────────────────┤
     │android-bridge.js                         │183 KB              │Core sync/backup logic, fetch interceptor, storage ops              │
     ├──────────────────────────────────────────┼────────────────────┼────────────────────────────────────────────────────────────────────┤
     │sync/local-data-adapter.js                │13 KB               │IndexedDB/localStorage adapter, local ↔ backup conversion           │
     ├──────────────────────────────────────────┼────────────────────┼────────────────────────────────────────────────────────────────────┤
     │sync/backup-normalizer.js                 │14 KB               │Backup validation, normalization, merge, canonical payload          │
     ├──────────────────────────────────────────┼────────────────────┼────────────────────────────────────────────────────────────────────┤
     │sync-size-optimizer.js                    │12 KB               │Smart upload/download/merge decisions by size                       │
     ├──────────────────────────────────────────┼────────────────────┼────────────────────────────────────────────────────────────────────┤
     │restore-and-launch.js                     │28 KB               │Boot flow, offline cached bootstrap, onboarding gate                │
     ├──────────────────────────────────────────┼────────────────────┼────────────────────────────────────────────────────────────────────┤
     │pwa-local.js                              │8 KB                │Online/offline detection, SW registration, status banner            │
     ├──────────────────────────────────────────┼────────────────────┼────────────────────────────────────────────────────────────────────┤
     │assets/useSyncStore-Di0wBMnH.js           │(minified)          │React Zustand store for sync UI state                               │
     └──────────────────────────────────────────┴────────────────────┴────────────────────────────────────────────────────────────---------

