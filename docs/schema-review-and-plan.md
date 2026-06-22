# Annrashtra DST — Schema Review & Implementation Plan

> Status: planning artifact only. No application code yet.
> Source of truth for the current DB is the original `schema.sql`; proposed changes
> live in `db/schema_v2.sql` as an additive migration.

## A. Schema gaps vs. the stated key rules

Rules in `CLAUDE.md` that the original schema cannot enforce or record:

| Rule | Status | Gap |
|---|---|---|
| "Promoter rewards/points count only verified or converted leads" | Missing | No points/rewards/targets table. Nothing records what a promoter earned or the rule that gates it. |
| "Every write is logged; promoters cannot edit history" | Partial | Only `stock_transactions` is a ledger. No general audit log for leads, sales, attendance, price changes, overrides. |
| "Territory lock… supervisor can override" | Partial | `locations.radius_m` exists, but nothing records whether an activity was in-radius, or that a supervisor overrode it (who/when/why). |
| OTP flows (promoter login + QR lead) | Missing | No table to store OTP code, purpose, target mobile, expiry, attempt count. Both MSG91 OTP flows need this. |
| "Keep all writes idempotent" (offline-first sync) | Missing | Server generates UUIDs by default. With no client-supplied idempotency key, a re-sent offline write creates a duplicate row. **Most important gap.** |
| WhatsApp invoice + lead confirmation (MSG91) | Partial | `sales.whatsapp_status` is one field with no message id, template, retry, or webhook history; lead `whatsapp_confirmed` has no delivery record. |

## B. Other schema issues

- **`leads.mobile NOT NULL UNIQUE` (global)** — a global unique means the same number can never be re-captured at another location/campaign, and collides with the `customers` master. Consider per-campaign uniqueness, or block at the app layer with a friendly "already a lead" path.
- **Two sources of truth for "sold"** — `inventory.sold` vs `stock_transactions(type='sale_deduction')` can drift. Treat the ledger as truth, `inventory` as a daily rollup.
- **No `UNIQUE` on attendance** per `(promoter_id, shift, day)` — allows duplicate check-ins, which the offline queue will produce on retry.
- **`stock_transactions.quantity`** signed but unconstrained — no `CHECK` that sign matches `type`.
- **No `updated_at`** on mutable rows (`leads.status`, `sales.whatsapp_status`, `attendance.check_out_at`). Sync and audit both want it.
- **`sales.total`** isn't tied to `sum(sale_items)` — must be computed server-side from `products.price`, never trusted from the client.
- **Role isolation** ("promoter reads/writes only own data") is not expressible in DDL — needs app-layer scoping or Postgres RLS. Decide now.

## C. Proposed schema additions (implemented in `db/schema_v2.sql`)

1. `otp_verifications` — purpose (`login` / `qr_lead`), mobile, hashed code, expiry, attempts, consumed_at.
2. `promoter_points` — append-only rewards ledger; references the earning lead/sale; only verified/converted leads earn.
3. `audit_log` — actor, role, action, entity, before/after JSONB; promoters get INSERT-only.
4. **Territory override** — `in_radius`, `override_by`, `override_reason` columns on `attendance`, `leads`, `sales`.
5. `outbox_messages` — MSG91 SMS/WhatsApp send + delivery tracking (provider id, template, status, retries); the natural idempotency point for sends.
6. **Idempotency key** — `client_uuid uuid UNIQUE` on `attendance`, `leads`, `sales`, `stock_transactions`. The Flutter app generates it offline; the API upserts on it.

Plus safe §B fixes: `UNIQUE (promoter_id, shift, day)` on attendance, a sign `CHECK` on `stock_transactions`, and `updated_at` columns with a touch trigger.

## D. Architecture

**api/** (Node + Express + pg, Render Singapore)
- `routes → controllers → services → repositories(pg)`; SQL stays in repositories.
- Auth: MSG91 OTP → JWT carrying `user_id` + `role`; middleware enforces role + own-data scoping.
- Idempotency middleware: read `client_uuid`, upsert, return same resource on replay.
- Money computed server-side from `products` into `sale_items.unit_price` / `sales.total`.
- Integrations behind adapters: `msg91Sms`, `msg91Whatsapp`, `firebaseStorage` (URL only), `razorpay`; messaging via `outbox_messages`.
- Migrations checked in; `schema.sql` + `schema_v2.sql` are source of truth.

**dashboard/** (React, Cloudflare Pages) — admin + supervisor.
- Login, promoters/territories, **Products & pricing** (edits `products`), leads & sales monitoring, refill approvals, canopy verification, reports/points. Role-gated UI mirroring API.

**mobile/** (Flutter, Android, offline-first) — promoter.
- Local SQLite mirror + write queue; every queued write carries a `client_uuid`. Sync flushes when online; server idempotency makes replays safe.
- Flows: OTP login; attendance (selfie + canopy photo → Firebase, store URL); lead capture (manual = instant `unverified`, never blocked on OTP; QR = customer-phone OTP); sales + WhatsApp invoice; daily stock cycle + refill request.

## E. Phasing

1. **Schema v2** — apply `db/schema_v2.sql`. ✅ done (applied to Neon Singapore)
2. **API core** — auth/OTP, idempotency middleware, leads, sales (server-side pricing), inventory/stock, attendance. ✅ **complete** — built + e2e-verified (38/38 against the real DB).
3. **API integrations** — MSG91 SMS+WhatsApp via outbox, Firebase URL handling, optional Razorpay.
   - ✅ Outbox **sender worker** built + e2e-verified: `scripts/outbox-worker.js` (loop / `--once`) and `POST /api/outbox/process` (admin). Polls `outbox_messages`, sends via the MSG91 adapter, marks sent/failed with retries (FOR UPDATE SKIP LOCKED), and on a successful lead-confirmation send moves the lead to `whatsapp_confirmed` + awards points.
   - ✅ MSG91 adapter: dev mode (logs, with a failure sentinel) verified; **real HTTP calls wired but UNTESTED** until live auth key + DLT/approved templates exist. Login OTP-over-SMS uses the same adapter (dev logs to server.log).
   - ✅ Delivery webhook `POST /api/outbox/webhook` (public, optional `x-webhook-secret`): flips sent→delivered and uses **delivery** as the lead-confirmation trigger. Dev auto-simulates delivery; prod awaits the MSG91 callback. Verified.
   - ⬜ Firebase Storage upload handling; ⬜ Razorpay; ⬜ live MSG91 credentials/templates.
4. **Dashboard** — ✅ scaffolded + click-tested: Overview (role-scoped reports), refill approvals, canopy verification, lead verify/convert, products pricing.
   - **Reports**: `GET /api/reports/overview` scoped per role (promoter self / supervisor team / admin org-wide) → KPIs, 7-day sales, lead funnel, promoter leaderboard. Mobile shows a promoter "My week" card. Export (CSV/PDF) and scheduled email/WhatsApp digests are still ⬜.
5. **Mobile** — ✅ offline-first foundation built + verified (`flutter analyze` clean, unit test + `flutter build web` pass).
   - OTP login (promoter-only), durable Hive write-queue with device-generated `client_uuid`, idempotent sync engine, connectivity auto-sync on reconnect.
   - Flows: lead capture, sale (server-priced), attendance check-in, opening stock + refill request, sync-queue viewer. Reads (products/locations) cached for offline.
   - ✅ Android toolchain set up (Android Studio + SDK 36 + cmdline-tools + licenses); debug APK builds clean.
   - ✅ Real GPS (geolocator, permission handling + manual fallback) and ✅ camera capture (image_picker: selfie + canopy with preview) — both APK-verified. Photo upload goes through a `PhotoUploader` abstraction, currently a stub (`pending-upload://…`).
   - ⬜ Firebase Storage upload (swap StubPhotoUploader → FirebaseUploader once a Firebase project exists); ⬜ QR flow (promoter QR display + customer-facing lead/OTP — partly a separate web piece); ⬜ on-device run + release APK signing.

### Verified so far (`api/scripts/e2e-test.js`, re-runnable, 38/38)
auth → JWT • lead capture (unverified, idempotent, dup-mobile 409) • sale (server-side
pricing, stock ledger, inventory rollup, invoice outbox, idempotent) • attendance
(territory radius check, supervisor override, daily-unique, check-out, canopy verify) •
inventory (opening allocation, daily cycle, refill request → supervisor approve/reject,
ledger + inventory.refill bump, idempotent).

### Cross-cutting status
- **audit_log** ✅ wired via write-logging middleware — every authenticated successful write is logged (after-image). ⬜ before-images for updates still TODO.
- **promoter_points** ✅ awarded on lead verify (+10) / convert (+25), idempotent — via both the supervisor PATCH and the outbox lead-confirmation path.
- **outbox worker** ✅ built + verified (see phase 3 above).
- ⬜ Remaining: live MSG91 credentials/templates, Firebase uploads, delivery webhooks, mobile app.
