-- ============================================================
--  Annrashtra DST — schema_v3 (additive migration)
--  Adds the refill-request workflow. The inventory daily cycle and the
--  stock_transactions ledger already exist (schema.sql); this only adds the
--  pending-request holding table so a supervisor can approve/reject.
--  Idempotent and re-runnable.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE refill_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS refill_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id   uuid NOT NULL REFERENCES users(id),
  product_id    uuid NOT NULL REFERENCES products(id),
  qty           int NOT NULL CHECK (qty > 0),
  status        refill_status NOT NULL DEFAULT 'pending',
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_by    uuid REFERENCES users(id),                 -- supervisor/admin who decided
  decided_at    timestamptz,
  decision_note text,
  stock_txn_id  uuid REFERENCES stock_transactions(id),    -- the 'refill' ledger row created on approval
  client_uuid   uuid,                                      -- offline idempotency for the request
  day           date NOT NULL DEFAULT current_date
);

-- Same partial-unique pattern as the other offline-write tables (see schema_v2 note):
--   upserts MUST be written ON CONFLICT (client_uuid) WHERE client_uuid IS NOT NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_refill_client_uuid ON refill_requests(client_uuid) WHERE client_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refill_status   ON refill_requests(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_refill_promoter ON refill_requests(promoter_id, requested_at);
