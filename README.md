# Annrashtra DST

Field-sales automation for Khapli Flour canopy promotions (Admin / Supervisor / Promoter).

> **Current phase: planning only.** No application code yet. See `docs/` for the
> schema review and implementation plan, and `db/` for the schema.

## Layout
- `docs/` — schema review & implementation plan
- `db/` — `schema.sql` (original, source of truth) + `schema_v2.sql` + `schema_v3.sql` (additive migrations)
- `api/` — Node.js + Express + PostgreSQL backend — **phase-2 core complete & e2e-verified**
- `dashboard/` — React admin/supervisor web app (not started)
- `mobile/` — Flutter offline-first promoter app (not started)

## API status
Verticals built and verified end-to-end against Neon (38/38 in `api/scripts/e2e-test.js`):
auth/OTP, leads, sales, attendance, inventory/refill. Not yet built: MSG91 outbox
sender worker, Firebase upload handling, audit_log + promoter_points wiring, dashboard, mobile.

## Run the API locally
```
cd api
cp .env.example .env        # set DATABASE_URL (Neon)
npm install
npm run migrate             # applies db/schema.sql, schema_v2.sql; run schema_v3.sql too
npm run seed                # dev promoter + supervisor + customer + location
npm run dev                 # http://localhost:8080/health
```

## Next steps
See `docs/schema-review-and-plan.md` section E (phasing).

## Secrets
All keys (Neon, MSG91, Firebase, Razorpay) live in a gitignored local `.env`.
Never commit secrets.
