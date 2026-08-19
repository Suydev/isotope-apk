# IsotopeAI Supabase Backup & Restore Guide

> **Backup system lives in `isotope-code/`** — this is the source of truth for backup/restore operations.

---

## Quick Start

```bash
cd /path/to/isotope-code

# Create a full backup (schema + data + auth + storage)
./backup.sh backup

# Restore to a new/existing Supabase project
./backup.sh restore backups/isotope-backup-20260815-092119.tar.gz \
  --supabase-url https://new-project.supabase.co \
  --service-key <service_role_key>

# Verify a backup against current project
./backup.sh verify backups/isotope-backup-20260815-092119.tar.gz

# Show backup info
./backup.sh info backups/isotope-backup-20260815-092119.tar.gz
```

---

## Prerequisites

- Node.js (v18+)
- Supabase CLI (optional, for local dev)
- Service Role Key (required for restore, not for backup)
- SUPABASE_ACCESS_TOKEN (optional, for Management API calls)

---

## Key Files

| File | Purpose |
|------|---------|
| `backup.sh` | Main backup/restore/verify script |
| `scripts/schema-dump.mjs` | Schema dumper (used by backup.sh) |
| `.backup_env` | Keeper project keys (git-ignored, never commit) |
| `.env` | App config (falls back if .backup_env missing) |
| `backups/` | Output directory (git-ignored) |

---

## Key Management

**Precedence (highest to lowest):**
1. CLI flags (`--supabase-url`, `--service-key`, `--pat`)
2. `.backup_env` (keeper project keys — **never commit**)
3. `.env` (app config)
4. Shell environment

**Required keys for backup:**
```bash
SUPABASE_URL=https://project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Required for full backup
SUPABASE_ACCESS_TOKEN=sbp_...     # Optional, for Management API
```

**Required keys for restore:**
```bash
SUPABASE_URL=https://new-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Required
SUPABASE_ACCESS_TOKEN=sbp_...     # Optional, for Management API
```

---

## Backup Command

```bash
# Full backup (default)
./backup.sh backup

# Custom output directory
./backup.sh backup --out ./my-backups

# Schema only (no storage files)
./backup.sh backup --no-storage

# Keep only last N backups
./backup.sh backup --keep 5

# Skip verification (faster)
./backup.sh backup --no-verify
```

**Output:** `backups/isotope-backup-YYYYMMDD-HHMMSS.tar.gz` (+ `.sha256` sidecar)

**What's included:**
- `schema.sql` — Full schema (tables, functions, RLS, grants)
- `db/*.jsonl` — All table data (42 tables)
- `db/auth.users.jsonl` — Auth users
- `storage/` — All buckets (user-content, avatars, notes, group-icons, study-material)
- `manifest.json` — Integrity metadata

---

## Restore Command

```bash
# Restore to new project (interactive prompts for missing keys)
./backup.sh restore backups/isotope-backup-20260815-092119.tar.gz \
  --supabase-url https://new-project.supabase.co \
  --service-key <service_role_key>

# With all keys via flags (CI/CD)
./backup.sh restore backups/isotope-backup-20260815-092119.tar.gz \
  --supabase-url https://new-project.supabase.co \
  --service-key <service_role_key> \
  --pat <access_token>

# Restore using .backup_env keys
./backup.sh restore backups/isotope-backup-20260815-092119.tar.gz
```

**Restores:**
1. Schema (tables, functions, RLS, grants)
2. All table data (42 tables)
3. Auth users
4. Storage buckets + files
5. Verifies counts before/after (aborts on mismatch)

---

## Verify Command

```bash
# Verify backup against current project
./backup.sh verify backups/isotope-backup-20260815-092119.tar.gz

# Verify against different project
./backup.sh verify backups/isotope-backup-20260815-092119.tar.gz \
  --supabase-url https://other-project.supabase.co \
  --service-key <service_role_key>
```

**Checks:**
- Table existence
- Row counts (per table)
- Auth users count
- Storage buckets/files

---

## Info Command

```bash
./backup.sh info backups/isotope-backup-20260815-092119.tar.gz
```

**Shows:**
- File size, SHA256, gzip integrity
- Created timestamp, source project
- Table count, row counts, auth users
- Storage buckets/files size

---

## Production Backup Workflow

```bash
# 1. Ensure keys in .backup_env (never committed)
cat > /path/to/isotope-code/.backup_env <<'EOF'
SUPABASE_URL=https://ollsqiutzartjhiuzkbf.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ACCESS_TOKEN=sbp_...
EOF

# 2. Run backup
cd /path/to/isotope-code
./backup.sh backup --keep 7

# 3. Copy to off-site storage (S3, GCS, etc.)
aws s3 cp backups/isotope-backup-*.tar.gz s3://my-bucket/isotope-backups/
aws s3 cp backups/*.sha256 s3://my-bucket/isotope-backups/
```

---

## Disaster Recovery

### Scenario: Supabase project deleted/corrupted

```bash
# 1. Create new Supabase project
# 2. Get service role key from new project settings
# 3. Restore
./backup.sh restore backups/isotope-backup-20260815-092119.tar.gz \
  --supabase-url https://new-project.supabase.co \
  --service-key <new_service_role_key>

# 4. Update isotope-apk/.env with new project keys
# 5. Rebuild APK
cd /path/to/isotope-apk
REPO_DIR=/path/to/isotope-code SOURCE_DIR=/path/to/isotope-code/public npm run build
```

---

## CI/CD Integration

```yaml
# .github/workflows/backup.yml
name: Daily Supabase Backup
on:
  schedule:
    - cron: '0 3 * * *'  # Daily 3 AM UTC
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: Suydev/isotope-code
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Run backup
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        run: |
          ./backup.sh backup --keep 30
      - name: Upload to S3
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          aws s3 cp backups/ s3://my-bucket/isotope-backups/ --recursive
```

---

## Security Notes

| Rule | Enforcement |
|------|-------------|
| Never commit `.backup_env` | `.gitignore` |
| Never commit `backups/` | `.gitignore` |
| Service role key only in secrets | GitHub Secrets / 1Password |
| Anon key is public | OK in client code |
| Rotate keys quarterly | Manual process |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `node.js required` | `install.sh` or install Node 18+ |
| `gzip integrity: failed` | Re-download backup, check SHA256 |
| `table count mismatch` | Run `verify`, check for partial restore |
| `storage bucket not found` | Create buckets in Supabase dashboard first |
| `auth users count mismatch` | Check RLS policies on auth tables |

---

## File Reference

```
isotope-code/
├── backup.sh                 # Main script
├── scripts/
│   └── schema-dump.mjs      # Schema dumper
├── .backup_env              # Keeper keys (git-ignored)
├── .env                     # App config
├── backups/                 # Output (git-ignored)
│   ├── isotope-backup-*.tar.gz
│   └── *.tar.gz.sha256
└── backups/ (git-ignored)
```

---

## Quick Reference Card

```bash
# Backup
./backup.sh backup --keep 7

# Restore
./backup.sh restore backup.tar.gz --supabase-url https://x.supabase.co --service-key xxx

# Verify
./backup.sh verify backup.tar.gz

# Info
./backup.sh info backup.tar.gz
```

**That's it.** The backup system handles schema, data, auth, storage, and verification automatically.

---

## Redeployment to Another Account (Step-by-Step)

This is the exact workflow to move IsotopeAI to a **different Supabase account/project**.

### Prerequisites

- Access to **source** Supabase project (current: `ollsqiutzartjhiuzkbf`)
- Access to **target** Supabase account (new account)
- `isotope-code` repo cloned locally
- Service role keys for **both** projects

---

### Step 1: Create Fresh Backup from Source

```bash
cd /path/to/isotope-code

# Ensure .backup_env has SOURCE project keys
cat > .backup_env <<'EOF'
SUPABASE_URL=https://ollsqiutzartjhiuzkbf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<source_service_role_key>
SUPABASE_ACCESS_TOKEN=sbp_<source_access_token>
EOF

# Create fresh backup
./backup.sh backup
# Output: backups/isotope-backup-20260819-XXXXXX.tar.gz
```

---

### Step 2: Create Target Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Choose **target account** (different email/org)
3. Note the **Project Ref** (e.g., `abcdefghijklmnop`)
4. Get **Service Role Key** from Settings → API

---

### Step 3: Restore to Target Project

```bash
cd /path/to/isotope-code

# Restore using backup + TARGET project keys
./backup.sh restore backups/isotope-backup-20260819-XXXXXX.tar.gz \
  --supabase-url https://abcdefghijklmnop.supabase.co \
  --service-key <target_service_role_key> \
  --pat <target_access_token>   # optional but recommended
```

**What happens:**
1. Creates schema (tables, functions, RLS, grants)
2. Imports all 42 tables data
3. Creates auth users (34 users)
5. Restores storage buckets + files
6. **Verifies row counts** — aborts if mismatch

---

### Step 4: Update isotope-apk for New Project

```bash
cd /path/to/isotope-apk

# Update .env with TARGET project keys
cat > .env <<'EOF'
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=<target_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<target_service_role_key>  # for admin ops only
SUPABASE_PROJECT_REF=abcdefghijklmnop
APP_VERSION=3.4.6
APP_NAME=IsotopeAI
GEMINI_API_KEY=
GROQ_API_KEY=
SENTRY_DSN=
YEPAPI_KEY=
EOF

# Update committed config
cat > supabase.config.json <<'EOF'
{
  "url": "https://abcdefghijklmnop.supabase.co",
  "anonKey": "<target_anon_key>",
  "projectRef": "abcdefghijklmnop"
}
EOF
```

---

### Step 5: Rebuild APK

```bash
cd /path/to/isotope-apk

# Full rebuild
REPO_DIR=/path/to/isotope-code \
SOURCE_DIR=/path/to/isotope-code/public \
npm run build

# Or full pipeline
npm run build && npm run android:debug
```

---

### Step 6: Verify Deployment

```bash
# 1. Install APK on device
# 2. Open app → should show login screen
# 3. Test One Tap login → should work with new project
# 4. Test email/password login
# 4. Test data sync (create task, wait, check cloud)
```

---

### Step 7: Update Google OAuth (Required)

**In Google Cloud Console → APIs & Services → Credentials:**

1. Find OAuth client: `801132168802-j8a7hetf3d6ke6ljb8tftb68sm0roqa5.apps.googleusercontent.com`
2. **Authorized redirect URIs** → Add:
   ```
   https://abcdefghijklmnop.supabase.co/auth/v1/callback
   ```
2. **Authorized JavaScript origins** → Add:
   ```
   https://abcdefghijklmnop.supabase.co
   ```

**In Supabase Dashboard → Authentication → Providers → Google:**
- Ensure Client ID/Secret match Google Cloud Console
- Save

---

### Checklist

- [ ] Fresh backup created from source
- [ ] Target Supabase project created
- [ ] Restore completed (verify row counts match)
- [ ] isotope-apk .env updated with target keys
- [ ] supabase.config.json updated
- [ ] APK rebuilt and tested
- [ ] Google OAuth redirect URIs updated
- [ ] Supabase Google provider configured
- [ ] Test login + sync on device

---

### Rollback Plan

If target deployment fails:

```bash
# Restore back to source (if needed)
./backup.sh restore backups/isotope-backup-20260819-XXXXXX.tar.gz \
  --supabase-url https://ollsqiutzartjhiuzkbf.supabase.co \
  --service-key <source_service_role_key>
```

---

### Key Files to Update

| File | Update |
|------|--------|
| `isotope-apk/.env` | Target URL, anon key, service role, project ref |
| `isotope-apk/supabase.config.json` | Target URL, anon key, project ref |
| `isotope-code/.backup_env` | Target keys (for future backups) |
| Google Cloud Console | Add target redirect URIs |
| Supabase Dashboard | Google provider config |

---

That's it. The backup/restore system handles schema + data + auth + storage automatically. Just swap the keys and rebuild.