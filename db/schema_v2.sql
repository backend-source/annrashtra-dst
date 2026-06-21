-- ============================================================
--  Annrashtra DST — schema_v2 (additive migration)
--  Applies the gaps from docs/schema-review-and-plan.md (section C + safe B fixes).
--  Idempotent: safe to run on top of the original schema.sql more than once.
--  Requires PostgreSQL 13+ and the pgcrypto extension (already enabled in schema.sql).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- new enums (guarded) ----------
DO $$ BEGIN
  CREATE TYPE otp_purpose AS ENUM ('login', 'qr_lead');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE outbox_channel AS ENUM ('sms', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE outbox_status AS ENUM ('queued', 'sent', 'delivered', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
--  C1. OTP verifications (promoter login + QR-lead OTP)
--  Store only a hash of the code. Never block manual lead capture on this.
-- ============================================================
CREATE TABLE IF NOT EXISTS otp_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose     otp_purpose NOT NULL,
  mobile      text NOT NULL,
  code_hash   text NOT NULL,                 -- bcrypt/argon hash of the OTP, never the plaintext
  expires_at  timestamptz NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  consumed_at timestamptz,                    -- set when the OTP is successfully verified
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_mobile_purpose ON otp_verifications(mobile, purpose, created_at);

-- ============================================================
--  C2. Promoter points (append-only rewards ledger)
--  Only verified or converted leads earn — enforced in the service layer AND
--  guarded here by a one-row-per-source unique so a lead/sale can't double-earn.
-- ============================================================
CREATE TABLE IF NOT EXISTS promoter_points (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id  uuid NOT NULL REFERENCES users(id),
  points       int NOT NULL,
  reason       text NOT NULL,                 -- e.g. 'lead_verified', 'lead_converted', 'sale'
  lead_id      uuid REFERENCES leads(id),
  sale_id      uuid REFERENCES sales(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promoter_points_source CHECK (lead_id IS NOT NULL OR sale_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_lead   ON promoter_points(lead_id, reason) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_sale   ON promoter_points(sale_id, reason) WHERE sale_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_points_promoter ON promoter_points(promoter_id, created_at);

-- ============================================================
--  C3. Audit log (every write logged; promoters INSERT-only)
--  Grant only INSERT on this table to the promoter DB role / enforce in app.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid REFERENCES users(id),
  role       user_role,
  action     text NOT NULL,                   -- 'insert' | 'update' | 'delete' | domain action
  entity     text NOT NULL,                   -- table / aggregate name
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor_id, created_at);

-- ============================================================
--  C5. Outbox messages (MSG91 SMS / WhatsApp; idempotent sends + delivery)
-- ============================================================
CREATE TABLE IF NOT EXISTS outbox_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       outbox_channel NOT NULL,
  to_mobile     text NOT NULL,
  template      text,                          -- DLT / approved template name
  payload       jsonb,                         -- template variables
  status        outbox_status NOT NULL DEFAULT 'queued',
  provider_msg_id text,                        -- MSG91 message id (for webhook reconciliation)
  attempts      int NOT NULL DEFAULT 0,
  last_error    text,
  sale_id       uuid REFERENCES sales(id),     -- when this is an invoice
  lead_id       uuid REFERENCES leads(id),     -- when this is a lead confirmation
  dedupe_key    text UNIQUE,                   -- idempotency for sends (e.g. 'invoice:<sale_id>')
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_messages(status, created_at);

-- ============================================================
--  C4. Territory override fields (in-radius + supervisor override)
-- ============================================================
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS in_radius        boolean;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS override_by      uuid REFERENCES users(id);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS override_reason  text;

ALTER TABLE leads      ADD COLUMN IF NOT EXISTS in_radius        boolean;
ALTER TABLE leads      ADD COLUMN IF NOT EXISTS override_by      uuid REFERENCES users(id);
ALTER TABLE leads      ADD COLUMN IF NOT EXISTS override_reason  text;

ALTER TABLE sales      ADD COLUMN IF NOT EXISTS in_radius        boolean;
ALTER TABLE sales      ADD COLUMN IF NOT EXISTS override_by      uuid REFERENCES users(id);
ALTER TABLE sales      ADD COLUMN IF NOT EXISTS override_reason  text;

-- ============================================================
--  C6. Idempotency keys for offline-first writes
--  Flutter generates client_uuid offline; the API upserts ON CONFLICT (client_uuid).
--  NOTE: these are PARTIAL unique indexes (WHERE client_uuid IS NOT NULL) so they
--  don't index the many NULLs from non-offline rows. Postgres only matches a partial
--  index if the statement repeats the predicate, so the upsert MUST be written as:
--      ON CONFLICT (client_uuid) WHERE client_uuid IS NOT NULL DO ...
-- ============================================================
ALTER TABLE attendance         ADD COLUMN IF NOT EXISTS client_uuid uuid;
ALTER TABLE leads              ADD COLUMN IF NOT EXISTS client_uuid uuid;
ALTER TABLE sales              ADD COLUMN IF NOT EXISTS client_uuid uuid;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS client_uuid uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_client_uuid ON attendance(client_uuid)         WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_client_uuid      ON leads(client_uuid)              WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_client_uuid      ON sales(client_uuid)              WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stocktxn_client_uuid   ON stock_transactions(client_uuid) WHERE client_uuid IS NOT NULL;

-- ============================================================
--  B fixes (safe)
-- ============================================================
-- One check-in per promoter / shift / day (kills offline-retry duplicates).
-- A stored generated column gives us an IMMUTABLE date to index on. The local-day
-- is computed in IST so a single field shift never spans two "days".
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS att_day date
  GENERATED ALWAYS AS (((check_in_at AT TIME ZONE 'Asia/Kolkata'))::date) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_shift_day
  ON attendance(promoter_id, shift, att_day) WHERE check_in_at IS NOT NULL;

-- Sign of a stock movement must match its type (guarded so the migration is re-runnable)
DO $$ BEGIN
  ALTER TABLE stock_transactions
    ADD CONSTRAINT chk_stocktxn_sign CHECK (
      (type IN ('allocation','refill') AND quantity > 0) OR
      (type = 'sale_deduction'         AND quantity < 0) OR
      (type = 'adjustment')                                  -- adjustment may be + or -
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at on mutable rows + a shared touch trigger
ALTER TABLE leads      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sales      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_leads_touch      BEFORE UPDATE ON leads      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_sales_touch      BEFORE UPDATE ON sales      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_attendance_touch BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
