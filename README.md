# Annrashtra DST

Field-sales automation for Khapli Flour canopy promotions (Admin / Supervisor / Promoter).

> **Current phase: planning only.** No application code yet. See `docs/` for the
> schema review and implementation plan, and `db/` for the schema.

## Layout
- `docs/` — schema review & implementation plan
- `db/` — `schema.sql` (original, source of truth) + `schema_v2.sql` + `schema_v3.sql` (additive migrations)
- `api/` — Node.js + Express + PostgreSQL backend — **complete & e2e-verified (69/69)**
- `dashboard/` — React (Vite) admin/supervisor web app — **scaffolded; click-tested**
- `mobile/` — Flutter offline-first promoter app — **foundation built; analyze/test/web-build pass**

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

## Mobile (Flutter promoter app)
```
cd mobile
flutter pub get
flutter run -d chrome --dart-define=API_BASE=http://localhost:8080   # web preview
# Android emulator: --dart-define=API_BASE=http://10.0.2.2:8080 (needs Android SDK)
```
Offline-first: every write is queued locally (Hive) with a device `client_uuid` and
synced when online; the server dedupes replays. Promoter-only OTP login. Flows: lead,
sale, attendance check-in, opening stock + refill request, and a sync-queue viewer.
Verify with `flutter analyze` and `flutter test`.

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
