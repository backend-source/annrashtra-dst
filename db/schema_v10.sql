-- ============================================================
--  Annrashtra DST — schema_v10 (additive migration)
--  Change batch 2:
--   #10 Points per packet sold — points move onto the product (admin-editable),
--       awarded per unit on each sale. Seed at 10 points/kg.
--  Idempotent / re-runnable.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;

-- Seed the current catalogue (10 points per kg): 4 kg box = 40, 800 g pouch = 8.
UPDATE products SET points = 40 WHERE sku = 'KF-4000' AND points = 0;
UPDATE products SET points = 8  WHERE sku = 'KF-800'  AND points = 0;
