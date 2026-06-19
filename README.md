# Thuso Health — Digital Health Passport & Smart Clinic Booking

> **"Thuso"** is a Sesotho word meaning **"help"** or **"assistance"** — because everyone deserves access to their health records and a clinic that's ready for them.

**Live demo:** [thuso-health.pages.dev](https://thuso-health.pages.dev)

---

## The Problem — South Africa's Healthcare Documentation Crisis

South Africa's public health system serves over 84% of the population through government clinics — yet most of these facilities still rely on paper folders, handwritten scripts, and manual queues. The consequences are severe:

- **Lost records** — A patient visiting a different clinic or province for the first time starts from scratch. A folder stays at one facility; the patient does not.
- **Repeated diagnostics** — Without a shared history, doctors re-order blood tests and X-rays that were done weeks before at another clinic, wasting limited resources and the patient's time.
- **No-shows cascade** — An unattended appointment locks a slot, extends waiting times for everyone else, and in chronic medication cases (ARVs, insulin) can mean dangerous gaps in treatment.
- **Queue opacity** — Patients arrive at whichever clinic is nearest with no idea of current wait times, causing avoidable 3–5 hour queues at busy facilities while nearby clinics sit underutilised.
- **Load-shedding disruptions** — Clinics on Eskom-affected schedules cannot confirm whether their systems are even on, leaving patients to travel only to find locked doors.

---

## The Digital Health Passport — Why a "Card"?

Every South African carries a physical ID book or smart card. It is universally understood: one card, your identity, accepted everywhere.

The **Digital Health Passport** uses that same mental model for healthcare:

| Physical ID Card | Digital Health Passport |
|---|---|
| You carry it in your wallet | Stored securely on your phone |
| Accepted at any government office | Accepted at any Thuso-enrolled clinic |
| Contains your ID number | Contains your Thuso ID (TH-XXXXXX) |
| Shown to the official | QR code scanned by the practitioner |
| Fixed data (name, DOB) | Live medical timeline — diagnoses, prescriptions, treatment plans |

When a patient presents at a new clinic, the practitioner enters the patient's **Thuso ID** or scans the QR code on the patient's phone. With the patient's one-time PIN consent, the doctor instantly sees the full visit history — across all facilities, in any language. No folder to fetch. No history to repeat. No guesswork.

The card format (physical bank-card proportions, SA flag stripe, gold chip) was intentional: it signals **trust, permanence, and portability** — the same emotional weight as your bank card, applied to your health.

---

## How Thuso Solves the G13 Health Challenge

The **Digital Pulse G13 challenge** asks builders to improve equitable access to quality healthcare for Gauteng residents, specifically addressing:

1. **Continuity of care across facilities** — The Health Passport gives every patient a portable, clinic-agnostic medical record. A patient discharged from Chris Hani Baragwanath can continue care at a Soweto community clinic without retelling their story.

2. **Reduction of no-shows and queue waste** — The WhatsApp no-show engine automatically detects missed appointments, sends template-based reminders with one-tap rebooking, and escalates to human follow-up after 48 hours. Priority slots protect chronic medication patients (ARVs, insulin) from dangerous prescription gaps.

3. **Offline-first rural access** — Clinic managers update capacity, load-shedding status, and solar power availability from any device. Patients can browse, book, and view their passport with zero connectivity — queued actions sync when signal returns.

4. **NHI alignment** — The platform is architected for the National Health Insurance transition: Thuso IDs can map to NHI patient identifiers, consent controls are POPIA-compliant, and audit logs track every record access.

5. **Language inclusion** — The passport and appointment information can be rendered in English, isiZulu, Sesotho, isiXhosa, and Afrikaans.

---

## Features

### Patient Portal (`index.html`)
- **Smart Queue** — ranks nearby clinics by combined travel time + current queue wait; Eskom load-shedding banner filters to solar-powered clinics automatically
- **Clinic Map** — real-time OSRM routing overlaid on Leaflet/OpenStreetMap (free, no API key, works offline via cached tiles)
- **Health Passport** — physical ID-card UI with live QR code, visit timeline, practitioner-signed records, and one-tap PDF download via jsPDF
- **Public Holiday Check** — warns patient if the target booking date is a South African public holiday
- **WhatsApp Integration** — floating button connects directly to the clinic's WhatsApp line

### Doctor / Manager Portal (`healthcare.html`)
- **Clinic Operations** — update capacity, grid power status, solar backup, operating hours, and services offered in real time
- **Patient Queue Admin** — view and manage the live queue of checked-in patients
- **Health Passport Lookup** — enter any patient's Thuso ID or email to view their full visit history; add a new consultation summary (diagnosis, treatment plan, prescription) that saves to the patient's passport instantly; works offline with local storage sync

### Offline Resilience
- All bookings, clinic data, and health records are cached in `localStorage`
- Writes queue when offline; sync prompt appears on reconnection
- No-network QR generation and PDF export — the passport works without the internet

---

## Architecture

```
thuso-health/
├── frontend/               # Cloudflare Pages — static, no build step
│   ├── landing.html        # Marketing / entry page
│   ├── index.html          # Patient portal (auth, queue, map, passport)
│   ├── healthcare.html     # Doctor / clinic manager portal
│   ├── app.js              # Single unified state engine (~2 800 lines)
│   ├── style.css           # Premium design system (indigo + SA palette)
│   ├── full_logo.png       # Thuso Health logo
│   └── wrangler.toml       # Cloudflare Pages deploy config
│
└── worker/                 # Cloudflare Worker — Hono API + D1 SQL
    ├── src/index.ts        # Routes: auth, clinics, patients, records, consent
    └── wrangler.toml       # D1 binding, JWT secret, KV namespace
```

**Stack:** Cloudflare Pages (frontend) · Cloudflare Workers + Hono (API) · Cloudflare D1 (SQLite at the edge) · Cloudflare R2 (medical file attachments) · JWT authentication · jsPDF · Leaflet + OSRM · QRCode.js

---

## Deployment

### Frontend → Cloudflare Pages

```bash
cd frontend
npx wrangler pages deploy . --project-name=thuso-health
```

Live URL: **https://thuso-health.pages.dev**

### Worker API → Cloudflare Workers

```bash
cd worker
npx wrangler deploy
```

### Local Development

```bash
# Frontend (static server)
cd frontend && npm run dev        # http://localhost:3000

# Worker (local D1 + bindings)
cd worker && npx wrangler dev     # http://localhost:8787
```

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Patient | paseka@thuso.health | password123 |
| Doctor / Manager | sarah@thuso.health | password123 |

> Both accounts work in **offline demo mode** — no network required for the hackathon demo.

---

## POPIA Compliance

- Patients explicitly grant or revoke practitioner access per visit
- Every passport access is logged with timestamp, accessor ID, and action type
- One-time access PINs expire per session
- No health data is stored outside the patient's own browser cache without explicit sync consent
- Audit logs are visible to the patient under "View Access Audit Logs (POPIA)"

---

*Built for the Digital Pulse Hackathon · Gauteng Department of Health · G13 Health Challenge · 2026*
