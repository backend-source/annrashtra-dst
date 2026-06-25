-- ============================================================
--  Annrashtra DST — schema_v7 (additive migration)
--  Cash collection v2: include UPI, and a two-step handshake.
--  Flow: promoter submits (cash + UPI) -> 'pending'
--        -> supervisor VERIFIES (can edit the amounts) -> 'verified'
--        -> promoter ACCEPTS -> 'received'  (or DISPUTES -> 'disputed',
--           which sends it back to the supervisor to re-verify).
--  Idempotent / re-runnable. (ADD VALUE is safe on PG12+.)
-- ============================================================

ALTER TYPE collection_status ADD VALUE IF NOT EXISTS 'verified';
ALTER TYPE collection_status ADD VALUE IF NOT EXISTS 'disputed';

ALTER TABLE collections ADD COLUMN IF NOT EXISTS upi_amount   numeric(10,2) NOT NULL DEFAULT 0;  -- UPI handed over
ALTER TABLE collections ADD COLUMN IF NOT EXISTS accepted_at  timestamptz;                       -- when the promoter accepted
ALTER TABLE collections ADD COLUMN IF NOT EXISTS dispute_note text;                              -- promoter's reason if disputed
