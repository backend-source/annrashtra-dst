-- ============================================================
--  Annrashtra DST — schema_v8 (additive migration)
--  Promoter-proposed locations + supervisor confirmation.
--  The promoter captures their canopy spot's GPS in the field -> status
--  'pending'; the supervisor confirms -> status 'active' and the geofence
--  radius is auto-set (150 m). Check-in is only allowed at 'active' spots.
--  Existing rows default to 'active' so they keep working. Idempotent.
-- ============================================================
ALTER TABLE locations ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'active'; -- pending | active
ALTER TABLE locations ADD COLUMN IF NOT EXISTS created_by   uuid REFERENCES users(id);       -- promoter who proposed it
ALTER TABLE locations ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES users(id);       -- supervisor/admin who confirmed
ALTER TABLE locations ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
