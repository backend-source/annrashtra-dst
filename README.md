# Annrashtra DST

Field-sales automation for Khapli Flour canopy promotions (Admin / Supervisor / Promoter).

> **Current phase: planning only.** No application code yet. See `docs/` for the
> schema review and implementation plan, and `db/` for the schema.

## Layout
- `docs/` — schema review & implementation plan
- `db/` — `schema.sql` (original, source of truth) + `schema_v2.sql` (additive migration)
- `api/` — Node.js + Express + PostgreSQL backend (not started)
- `dashboard/` — React admin/supervisor web app (not started)
- `mobile/` — Flutter offline-first promoter app (not started)

## Next steps
See `docs/schema-review-and-plan.md` section E (phasing). Start by applying
`db/schema_v2.sql` on a copy of the database.

## Secrets
All keys (Neon, MSG91, Firebase, Razorpay) live in a gitignored local `.env`.
Never commit secrets.
