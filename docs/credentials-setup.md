# Credentials & external-services setup

Where the company's accounts/keys plug into the app. **Golden rule:** backend secrets
live in `api/.env` locally (gitignored) and in the **hosting provider's env-var UI** in
production — never committed to git.

| Service | Purpose | Required? | Where the credential goes |
|---|---|---|---|
| Neon (Postgres) | Database | ✅ Required | `api/.env` → `DATABASE_URL` |
| MSG91 | Login OTP (SMS) + WhatsApp invoices | ✅ Required | `api/.env` → `MSG91_*` |
| Firebase Storage | Selfie / canopy / QR photos | ✅ Required | `mobile/android/app/google-services.json` |
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

## 3. Firebase Storage — photos (company Google account)
Photos are uploaded **from the mobile app**; the API only stores the returned URL.
- In the Firebase console, create a project (Storage region **asia-south1 / Mumbai**).
- Add an **Android app** with package `com.annrashtra.annrashtra_promoter`.
- Download **`google-services.json`** → place in `mobile/android/app/`.
- Run `flutterfire configure` (generates `mobile/lib/firebase_options.dart`); add
  `firebase_core` + `firebase_storage` deps; then swap `StubPhotoUploader` →
  a `FirebaseUploader` (one class — see `mobile/lib/services/photo_uploader.dart`).
- Set Storage **security rules** to allow authenticated writes only.
- The API needs no Firebase secret for this flow. (`FIREBASE_PROJECT_ID` /
  `FIREBASE_STORAGE_BUCKET` in `api/.env` are only for optional server-side use.)

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
