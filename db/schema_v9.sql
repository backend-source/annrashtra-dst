-- ============================================================
--  Annrashtra DST — schema_v9 (additive migration)
--  Change batch 2026-06:
--   #3 Multiple cash/UPI handovers per day  -> drop the one-per-day unique.
--   #2 No negative stock (server backstop)  -> flag oversold sales (never delete).
--  Idempotent / re-runnable.
-- ============================================================

-- #3: allow several handovers in a single day. Idempotency is still guaranteed
-- by uq_collection_client_uuid (a replayed client_uuid never double-inserts), so
-- only the calendar-day restriction is removed.
DROP INDEX IF EXISTS uq_collection_promoter_day;

-- A non-unique index keeps day-scoped lookups (ledger, expected vs handed) fast.
CREATE INDEX IF NOT EXISTS idx_collection_promoter_day ON collections(promoter_id, day);

-- #2: server backstop. The promoter app hard-blocks selling below stock, but a
-- stale/offline client could still sync a sale that pushes stock negative. Rather
-- than reject (the customer already paid), we accept it and FLAG it for the
-- supervisor/admin to reconcile.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS oversold boolean NOT NULL DEFAULT false;
