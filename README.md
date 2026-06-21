# Annrashtra DST

Field-sales automation for Khapli Flour canopy promotions (Admin / Supervisor / Promoter).

> **Current phase: planning only.** No application code yet. See `docs/` for the
> schema review and implementation plan, and `db/` for the schema.

## Layout
- `docs/` — schema review & implementation plan
- `db/` — `schema.sql` (original, source of truth) + `schema_v2.sql` + `schema_v3.sql` (additive migrations)
- `api/` — Node.js + Express + PostgreSQL backend — **phase-2 core complete & e2e-verified**
- `dashboard/` — React (Vite) admin/supervisor web app — **scaffolded; builds; proxy verified**
- `mobile/` — Flutter offline-first promoter app (not started)

## API status
Verticals built and verified end-to-end against Neon (52/52 in `api/scripts/e2e-test.js`):
auth/OTP, leads (+ verify/convert with points), sales, attendance, inventory/refill,
products pricing; every write is logged to `audit_log`. Not yet built: MSG91 outbox
sender worker, Firebase upload handling, mobile app.

## Dashboard
```
cd dashboard
npm install
npm run dev        # http://localhost:5173 (proxies /api to localhost:8080)
```
Admin/supervisor only. OTP login (dev OTP is printed in the API server log). Screens:
Refill Approvals, Leads (verify/convert), Products & Pricing (admin-editable).

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
