# ValueSight — Supabase Database Backup & Restore Runbook

This document details the step-by-step procedures for capturing logical database backups and restoring them in case of data loss or staging replication.

---

## 1. Automated Backups (Supabase Native)
*   **Paid Tiers (Pro/Enterprise):** Supabase runs automatic daily backups (physical backups via WAL-G) and retains them for 7 days (Pro) or 14 days (Enterprise).
    *   To restore from a daily backup, go to the **Supabase Dashboard** -> **Database** -> **Backups** -> click **Restore** on the target date.
*   **Free Tier:** Automatic backups are **not** supported. You must execute manual logical dumps (described below) as part of your deployment checklist or schedule.

---

## 2. Logical Backups via command-line (pg_dump)

Run these commands from a secure terminal with PostgreSQL client tools (`pg_dump` and `pg_restore`) installed.

### Connection Parameters
*   **Host:** `db.<project-ref>.supabase.co` (Replace `<project-ref>` with your Supabase Project Reference ID)
*   **Port:** `5432`
*   **User:** `postgres`
*   **Database:** `postgres`

### Create a Backup (Logical Dump)
Execute `pg_dump` to output a compressed custom-format archive file:

```bash
# Capture full database schema + data
pg_dump -h db.<project-ref>.supabase.co -U postgres -d postgres -F c -b -v -f valuesight_prod_backup.dump
```
*When prompted, enter your Supabase database master password.*

---

## 3. Database Restoration Procedure (pg_restore)

> [!CAUTION]
> Restoring a backup with `--clean` will **DROP** all existing tables before reconstructing them. Always take a fresh snapshot of the current state before performing a restore.

### Restore to a Target Database
To clean and rebuild the database from a backup file:

```bash
# Reconstruct the schema and populate data
pg_restore -h db.<project-ref>.supabase.co -U postgres -d postgres -v --clean --no-owner valuesight_prod_backup.dump
```
*If restoring to a local or staging DB, swap the host parameter accordingly.*

---

## 4. Verification Checklists

Post-restoration, verify the following indicators to ensure data integrity:

### Schema Check
Run these SQL queries in the Supabase SQL editor to confirm tables exist and are populated:
```sql
-- Check company universe count
SELECT count(*), ingest_status FROM companies GROUP BY ingest_status;

-- Verify latest analyses are present
SELECT count(*), max(saved_at) FROM analyses;

-- Confirm sector metadata exists
SELECT count(*) FROM sectors;
```

### Server Uptime Probe
Verify the API server reconnects successfully and serves the health check endpoint:
```bash
curl -i https://<your-render-url>/api/health
```
Expect HTTP `200 OK` and a response indicating database state is active:
```json
{
  "status": "ok",
  "message": "Fundamental Agent API running"
}
```
