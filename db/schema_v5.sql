-- ============================================================
--  Annrashtra DST — schema_v5 (additive migration)
--  Cash collection handover: promoter hands over the day's cash to the
--  supervisor, who verifies & confirms -> status 'received' (visible to both).
--  Idempotent / re-runnable.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE collection_status AS ENUM ('pending', 'received');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS collections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id   uuid NOT NULL REFERENCES users(id),
  day           date NOT NULL DEFAULT current_date,
  amount        numeric(10,2) NOT NULL,                 -- cash handed over by the promoter
  status        collection_status NOT NULL DEFAULT 'pending',
  confirmed_by  uuid REFERENCES users(id),              -- supervisor/admin who received it
  confirmed_at  timestamptz,
  note          text,
  client_uuid   uuid,                                   -- offline idempotency
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One handover per promoter per day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_promoter_day ON collections(promoter_id, day);
-- Offline idempotency (partial — repeat the predicate in ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_client_uuid ON collections(client_uuid) WHERE client_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collection_status ON collections(status, day);
