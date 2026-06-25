# Credentials & external-services setup

Where the company's accounts/keys plug into the app. **Golden rule:** backend secrets
live in `api/.env` locally (gitignored) and in the **hosting provider's env-var UI** in
production — never committed to git.

> **Account ownership — read first.** Create *every* production account (Neon, Render,
> Cloudflare, MSG91, Firebase, Razorpay) under a **single company-owned email** — e.g.
> `tech@annrashtra.com` or `it@annrashtra.com` — not a personal Gmail. The company's
> live infrastructure and billing must not be locked to one person's personal account.
> Add individuals (you, an IT person) as **collaborators/admins** with their own logins;
> keep *ownership* on the company address.
>
> Why now and not later: most of these platforms (Render especially) make **transferring
> account ownership painful** — it's far easier to start on the right email than migrate.
> If the company can spin up the address in the next day or two, wait for it.
>
> **Pending cleanup:** Neon was created on a personal account during development — migrate
> it (or recreate the prod project) under the company email, and rotate the dev password.

| Service | Purpose | Required? | Where the credential goes |
|---|---|---|---|
| Neon (Postgres) | Database | ✅ Required | `api/.env` → `DATABASE_URL` |
| MSG91 | Login OTP (SMS) + WhatsApp invoices | ✅ Required | `api/.env` → `MSG91_*` |
| Cloudflare R2 | Selfie / canopy / lead photos | ✅ Required | `api/.env` → `R2_*` (Render env in prod) |
| Razorpay | Online UPI collection | ⬜ Optional | `api/.env` → `RAZORPAY_*` |
| JWT / webhook secret | App-generated secrets | ✅ Required | `api/.env` (you generate these) |
| Render | API + outbox worker hosting | ✅ for go-live | Render dashboard env vars |
| Cloudflare Pages | Dashboard hosting | ✅ for go-live | Cloudflare build env var |
| Android keystore | Signed release APK | ✅ for Play Store | `mobile/android/key.properties` + `.jks` |

---

## 1. Neon (PostgreSQL) — database
- Create a **production** Neon project (region closest to India — Singapore today).
- Copy its connection string → `api/.env` → `DATABASE_URL=postgresql://...?sslmode=require`
- A dev project already exists (`annrashtra-dst-sg`). **Rotate the password that was shared during development.**

## 2. MSG91 — OTP login + WhatsApp (company account + DLT registration)
This is the biggest external dependency. Two parts:

**a) MSG91 account** — from the MSG91 dashboard, into `api/.env`:
- `MSG91_AUTH_KEY` — account auth key
- `MSG91_SENDER_ID` — DLT-approved sender header
- `MSG91_OTP_TEMPLATE_ID` — the OTP flow/template id
- `MSG91_WHATSAPP_NUMBER` — the integrated WhatsApp business number

**b) DLT registration** (India, on the telecom DLT portal — tied to the company's
registered entity; needs PAN/GST). Lead time **days–weeks**, so start early:
- Register the company as an entity → get the **Header (Sender ID)** approved
- Register & get approved: **SMS template** (OTP) and **WhatsApp templates** (invoice, lead confirmation)

**c) Delivery webhook** — in MSG91's delivery-callback settings, point it at
`https://<api-domain>/api/outbox/webhook` and set header `x-webhook-secret: <value>`
matching `api/.env` → `MSG91_WEBHOOK_SECRET`.

> Until these exist the app runs in dev mode (OTP prints to the server log, messages
> are simulated). No code change is needed when you add them — just fill `.env`.

## 3. Cloudflare R2 — photos (same Cloudflare account as the dashboard)
Selfie/canopy photos upload **from the app straight to R2** via a short-lived
presigned URL our API issues (`POST /api/uploads/presign`); the API only stores the
public URL on the attendance record. The app code (`R2Uploader`) is already wired —
this is pure account setup, then env vars on Render.

In the Cloudflare dashboard (business account):
1. **R2 → Create bucket** → name `annrashtra-photos` (location: Asia-Pacific).
2. **R2 → Manage R2 API Tokens → Create API token** → permission **Object Read & Write**,
   scoped to that bucket. Copy the **Access Key ID** and **Secret Access Key** (shown once).
3. Note your **Account ID** (R2 overview page, right side).
4. On the bucket → **Settings → Public access → Allow** (R2.dev subdomain). Copy the
   **Public R2.dev URL** (looks like `https://pub-<hash>.r2.dev`).

Then set these env vars (locally in `api/.env`, in prod on **Render → Environment**):
- `R2_ACCOUNT_ID` — the account id
- `R2_ACCESS_KEY_ID` — from the API token
- `R2_SECRET_ACCESS_KEY` — from the API token
- `R2_BUCKET` — `annrashtra-photos`
- `R2_PUBLIC_BASE` — the `https://pub-<hash>.r2.dev` URL

> Keys are unguessable (uuid in the path) so the public bucket is fine for a pilot.
> For stronger privacy later, keep the bucket private and serve via presigned GET URLs.
> No bucket CORS config is needed: the app's upload is a non-browser PUT, and the
> dashboard only loads images via `<img>` (a plain GET).

## 4. Razorpay — optional online UPI (company account, needs business KYC)
- Key ID + Secret → `api/.env` → `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
- Not needed for cash or cash-noted UPI.

## 5. App-generated secrets (you create these — not from a provider)
- `JWT_SECRET` — long random string, e.g. `openssl rand -hex 32`. **Required in production** (the API refuses to start without it).
- `MSG91_WEBHOOK_SECRET` — random string; also entered in MSG91's webhook config.

## 6. Hosting (production)
**Render** (company account) — two services from this repo's `api/`:
- Web service running `node src/index.js`.
- Background worker running `node scripts/outbox-worker.js` (sends queued messages).
- In Render's **Environment** for both, set every `api/.env` key, plus:
  - `NODE_ENV=production`
  - `CORS_ORIGIN=https://<dashboard-domain>`

**Cloudflare Pages** (company account) — build `dashboard/`:
- Set build env var `VITE_API_BASE=https://<render-api-domain>`.

## 7. Mobile build & release (company)
- Production build points at the live API:
  `flutter build apk --release --dart-define=API_BASE=https://<render-api-domain>`
- **Release signing** (Play Store): generate an upload keystore (`.jks`); create
  `mobile/android/key.properties` referencing it. **Keep the keystore + passwords in
  the company's secret store — never commit them.**

## What must NEVER be committed to git
`api/.env` · `mobile/android/app/google-services.json` · `mobile/android/key.properties`
· the `.jks` keystore. (All are gitignored or should be added to `.gitignore`.)
