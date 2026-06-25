# Plan: live "promoter left the area" alerts (background tracking)

Status: **planned, not built.** The pilot uses the *soft geofence at check-in*
(out-of-geofence check-ins are flagged for supervisor review). This document is the
design for true real-time alerts when a promoter leaves the spot mid-shift.

## Why it's a separate, heavier feature
A check-in is a single GPS reading. Detecting that someone *leaves* requires the
phone to report its location **continuously while on shift**, which brings:
- **Background location permission** — Android "Allow all the time"; Google Play
  requires a recorded justification + a prominent-disclosure consent screen.
- **Battery** — periodic GPS wakes the device; needs sensible intervals.
- **Privacy/consent** — you are continuously tracking staff; they must be told.
- **Reliability** — OEM battery killers, doze mode, app-swiped-away all interrupt it.

## Proposed design
1. **Shift session.** "Check in" starts a tracking session; "Check out" ends it.
   Only track between the two — never off-shift.
2. **On-device geofence.** Register the assigned location + radius (100–150 m) with
   the OS geofencing API (`geofence` / `flutter_background_geolocation`). The OS
   fires an **exit** event when the promoter crosses the boundary — far more
   battery-friendly than polling.
3. **Heartbeat (fallback).** Every N minutes (e.g. 5) post `{lat,lng,ts}` to a new
   `POST /api/tracking/ping`. Server compares to the location radius.
4. **Alert on exit.** When an exit event (or an out-of-range ping) arrives, write a
   `tracking_alerts` row (promoter, location, distance, ts) and notify supervisors:
   - dashboard badge/list (always), and/or
   - push notification (needs FCM — a Firebase Cloud Messaging setup) or a WhatsApp
     message via the existing MSG91 outbox.
5. **Dashboard.** A "Live / Alerts" view: who's currently on shift, last seen, and
   any "left the area" alerts to action.

## New pieces required
- **DB:** `tracking_pings` (optional, for a breadcrumb trail) + `tracking_alerts`.
- **API:** `POST /api/tracking/ping`, `GET /api/tracking/alerts`, session start/stop
  tied to check-in/out.
- **Mobile:** a background-location plugin (e.g. `flutter_background_geolocation`),
  the all-time permission + disclosure UI, OS geofence registration, heartbeat poster.
- **Notifications:** FCM (push) — needs a Firebase project for messaging — or reuse
  MSG91 to WhatsApp the supervisor.
- **APK:** new permissions → rebuild + new Play Store disclosure.

## Effort / sequence
1. Heartbeat-only MVP (ping + server range check + dashboard alert list) — moderate.
2. Add OS geofence exit events (battery win) — moderate.
3. Add push/WhatsApp notifications — small once FCM/MSG91 is wired.

## Decisions needed before building
- Notification channel: **dashboard-only**, **push (FCM)**, or **WhatsApp (MSG91)**?
- Heartbeat interval (battery vs freshness) — 5 min is a reasonable default.
- Retention for the breadcrumb trail (or don't store pings at all, only alerts).
