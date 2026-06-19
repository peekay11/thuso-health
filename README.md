# Thuso Health — Digital Health Passport & Smart Clinic Finder

**"Thuso Health"** is an offline-first app that helps patients find the nearest, least crowded clinic and provides a Digital Health Passport — a secure medical ID card with a one-time PIN for instant access to diagnoses, treatments, and prescriptions. It also gives clinic staff a queue dashboard to manage patient flow.


**Live demo:** [thuso-health.pages.dev](https://thuso-health.pages.dev)


## Problem Statement

Many patients struggle to choose the right clinic because they do not know which one is:

- Closest to them
- Least crowded
- Most reliable in terms of power and operating conditions
- Quickest to reach given travel time and queue delays

This often leads to wasted time, long waits, and poor decision-making when people need urgent care.

In addition, patients frequently lose or forget their medical history, diagnosis, and treatment plans. When they arrive at a clinic, they cannot effectively communicate their recent health records to practitioners, leading to:

- Repeated tests
- Misdiagnosis
- Treatment delays
- Redundant paperwork

---

## Solution

Thuso Health solves these challenges by delivering a dual-layered approach:

### 1. Smart Clinic Navigation
- Combines **travel time estimates**, **queue congestion information**, and **clinic power availability**
- Guides patients to the most practical clinic for their situation
- Works **offline** using a local database, ensuring reliability in areas with poor network coverage

### 2. Digital Health Passport (Card)
- Generates a portable, secure snapshot of a patient's critical medical data
- Includes patient ID, recent diagnosis, treatment plan, and prescribed medication
- Features a **One-Time Access PIN** for secure, temporary practitioner access
- Works offline — no internet connection is required to view or share the card

Together, these features reduce uncertainty, improve continuity of care, and help people reach a clinic that is both practical and efficient.



## How Thuso Solves the G13 Health Challenge(IMPACT)

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
├── frontend/ # Cloudflare Pages — static, no build step
│ ├── landing.html # Marketing / entry page
│ ├── index.html # Patient portal (auth, queue, map, passport)
│ ├── healthcare.html # Doctor / clinic manager portal
│ ├── app.js # Single unified state engine (~2 800 lines)
│ ├── style.css # Premium design system (indigo + SA palette)
│ ├── full_logo.png # Thuso Health logo
│ └── wrangler.toml # Cloudflare Pages deploy config
│
└── worker/ # Cloudflare Worker — Hono API + D1 SQL
├── src/index.ts # Routes: auth, clinics, patients, records, consent
└── wrangler.toml # D1 binding, JWT secret, KV namespace
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
cd frontend && npm run dev # http://localhost:3000

# Worker (local D1 + bindings)
cd worker && npx wrangler dev # http://localhost:8787
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