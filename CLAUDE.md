# Annrashtra DST — project context

## Stack
- mobile/ : Flutter (Android), offline-capable
- dashboard/ : React web (admin + supervisor)
- api/ : Node.js + Express + PostgreSQL (pg)

## Providers (India)
- Database: Neon (PostgreSQL). Pick the region closest to India — Mumbai (ap-south-1) if available, otherwise Singapore (ap-southeast-1).
- File storage: Firebase Storage (asia-south1 / Mumbai) for selfies, canopy photos, QR images. Upload from the app; store only the URL in Postgres.
- OTP / SMS: MSG91 (promoter login OTP, QR-lead OTP). Requires DLT-registered sender ID + templates.
- WhatsApp invoices & lead confirmation: MSG91 WhatsApp API. Use approved utility/authentication message templates.
- Online UPI collection (optional): Razorpay (existing tie-up). Cash is recorded offline; UPI can be cash-noted or collected via Razorpay.
- Backend hosting: Render (Singapore region). Dashboard hosting: Cloudflare Pages.

## Roles
- admin: full access
- supervisor: approves refills, verifies canopy activity, territory overrides, monitors
- promoter: mobile app only; can read/write ONLY their own data; cannot edit sales or stock history

## Key rules
- All money in INR. Products: Khapli Flour 800 g (₹160) and 4 kg (₹750) — read prices from the products table, never hardcode.
- Payments: cash or UPI. Invoice delivered over WhatsApp (MSG91).
- Lead verification: MANUAL leads are saved immediately as 'unverified', then confirmed via WhatsApp delivery -> 'whatsapp_confirmed'. QR leads use OTP on the customer's own phone -> 'otp_verified'. Never block manual capture on an OTP.
- Promoter rewards/points count only verified or converted leads.
- Territory lock: promoter activity allowed only within a location's radius_m; supervisor can override.
- Every write is logged; promoters cannot edit history.
- Offline-first on mobile: queue locally, sync when online. Keep all writes idempotent so the offline layer fits cleanly.

## Secrets
- Keep all keys (Neon connection string, MSG91 auth key, Firebase config, Razorpay keys) in a local .env that is gitignored. Never commit secrets.

## Schema
The database schema is in schema.sql — treat it as the source of truth.
