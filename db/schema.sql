-- ============================================================
--  Annrashtra DST — PostgreSQL schema (starting point)
--  Field sales automation: Admin / Supervisor / Promoter
--  Run on a fresh database. Requires PostgreSQL 13+.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- for gen_random_uuid()

-- ---------- enums ----------
CREATE TYPE user_role          AS ENUM ('admin', 'supervisor', 'promoter');
CREATE TYPE location_type      AS ENUM ('park', 'gym', 'society', 'club');
CREATE TYPE shift_type         AS ENUM ('morning', 'evening');
CREATE TYPE lead_source        AS ENUM ('manual', 'qr');
CREATE TYPE lead_verify_status AS ENUM ('unverified', 'whatsapp_confirmed', 'otp_verified');
CREATE TYPE lead_status        AS ENUM ('new', 'contacted', 'converted', 'dropped');
CREATE TYPE payment_mode       AS ENUM ('cash', 'upi');
CREATE TYPE whatsapp_status    AS ENUM ('pending', 'sent', 'delivered', 'failed');
CREATE TYPE stock_txn_type     AS ENUM ('allocation', 'refill', 'sale_deduction', 'adjustment');

-- ---------- users (admin, supervisor, promoter) ----------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  mobile        text NOT NULL UNIQUE,
  role          user_role NOT NULL,
  supervisor_id uuid REFERENCES users(id),          -- which supervisor oversees this promoter
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- locations (the 1,500 canopy spots) ----------
CREATE TABLE locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  area        text,
  type        location_type,
  lat         double precision,
  lng         double precision,
  radius_m    int NOT NULL DEFAULT 120,             -- allowed activity radius (100-150 m)
  assigned_to uuid REFERENCES users(id),            -- promoter this location is assigned to
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- products (admin-editable catalogue & pricing) ----------
-- Added beyond the original 9 tables so pricing is editable in the admin UI
-- (the "Products & pricing" screen). Today: Khapli Flour 800 g and 4 kg.
CREATE TABLE products (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name   text NOT NULL,
  sku    text UNIQUE,
  price  numeric(10,2) NOT NULL,
  active boolean NOT NULL DEFAULT true
);

-- ---------- attendance ----------
CREATE TABLE attendance (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id      uuid NOT NULL REFERENCES users(id),
  location_id      uuid REFERENCES locations(id),
  shift            shift_type NOT NULL,
  check_in_at      timestamptz,
  check_out_at     timestamptz,
  gps_lat          double precision,
  gps_lng          double precision,
  selfie_url       text,
  canopy_photo_url text,
  verified_by      uuid REFERENCES users(id),        -- supervisor who verified canopy activity
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------- customers (master record for marketing) ----------
CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  mobile      text NOT NULL UNIQUE,
  lead_source text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- leads ----------
CREATE TABLE leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id     uuid NOT NULL REFERENCES users(id),
  location_id     uuid REFERENCES locations(id),
  customer_id     uuid REFERENCES customers(id),
  name            text,
  mobile          text NOT NULL UNIQUE,              -- duplicate mobile numbers blocked
  health_concern  text,                              -- diabetes / weight_loss / fitness
  product_interest text,                             -- 800g / 4kg
  source          lead_source NOT NULL DEFAULT 'manual',
  verify_status   lead_verify_status NOT NULL DEFAULT 'unverified',
  status          lead_status NOT NULL DEFAULT 'new',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- sales ----------
CREATE TABLE sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id     uuid NOT NULL REFERENCES users(id),
  location_id     uuid REFERENCES locations(id),
  customer_id     uuid REFERENCES customers(id),
  invoice_no      text NOT NULL UNIQUE,
  payment_mode    payment_mode NOT NULL,
  total           numeric(10,2) NOT NULL DEFAULT 0,
  whatsapp_status whatsapp_status NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- sale_items (a sale can have multiple products) ----------
CREATE TABLE sale_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  qty        int NOT NULL CHECK (qty > 0),
  unit_price numeric(10,2) NOT NULL
);

-- ---------- inventory (daily stock cycle per promoter per product) ----------
CREATE TABLE inventory (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id uuid NOT NULL REFERENCES users(id),
  product_id  uuid NOT NULL REFERENCES products(id),
  opening     int NOT NULL DEFAULT 0,
  refill      int NOT NULL DEFAULT 0,
  sold        int NOT NULL DEFAULT 0,
  closing     int GENERATED ALWAYS AS (opening + refill - sold) STORED,
  day         date NOT NULL DEFAULT current_date,
  UNIQUE (promoter_id, product_id, day)
);

-- ---------- stock_transactions (the ledger) ----------
CREATE TABLE stock_transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id  uuid NOT NULL REFERENCES users(id),
  product_id   uuid NOT NULL REFERENCES products(id),
  type         stock_txn_type NOT NULL,
  quantity     int NOT NULL,                          -- signed: + in, - out
  approved_by  uuid REFERENCES users(id),             -- supervisor who approved a refill
  reference_id uuid,                                  -- e.g. the sale that caused a deduction
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- qr_codes (one per promoter) ----------
CREATE TABLE qr_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id uuid NOT NULL REFERENCES users(id),
  code        text NOT NULL UNIQUE,
  type        text NOT NULL DEFAULT 'lead',           -- lead / sale
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- helpful indexes ----------
CREATE INDEX idx_users_supervisor       ON users(supervisor_id);
CREATE INDEX idx_locations_assigned     ON locations(assigned_to);
CREATE INDEX idx_attendance_promoter    ON attendance(promoter_id, created_at);
CREATE INDEX idx_leads_promoter         ON leads(promoter_id, created_at);
CREATE INDEX idx_leads_status           ON leads(status);
CREATE INDEX idx_sales_promoter         ON sales(promoter_id, created_at);
CREATE INDEX idx_sale_items_sale        ON sale_items(sale_id);
CREATE INDEX idx_inventory_promoter     ON inventory(promoter_id, day);
CREATE INDEX idx_stocktxn_promoter      ON stock_transactions(promoter_id, created_at);

-- ---------- seed: the two products ----------
INSERT INTO products (name, sku, price) VALUES
  ('Khapli Flour 800 g pouch', 'KF-800',  160.00),
  ('Khapli Flour 4 kg box',    'KF-4000', 750.00);
