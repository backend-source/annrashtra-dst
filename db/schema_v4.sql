-- ============================================================
--  Annrashtra DST — schema_v4 (additive migration)
--  Refill delivery-confirmation flow:
--    pending -> approved (admin) -> delivered (promoter confirms actual qty)
--  Stock is added to inventory only on delivery confirmation, using the ACTUAL
--  quantity delivered from the factory (delivered_qty), not the requested qty.
--  Idempotent / re-runnable.
-- ============================================================

ALTER TYPE refill_status ADD VALUE IF NOT EXISTS 'delivered';

ALTER TABLE refill_requests ADD COLUMN IF NOT EXISTS delivered_qty int;
ALTER TABLE refill_requests ADD COLUMN IF NOT EXISTS delivered_at  timestamptz;
