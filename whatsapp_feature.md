1. System Components
A. Appointment State Machine

Each appointment moves through states:
Scheduled → Reminded → CheckedIn / NoShow → Completed / Rebooked
B. Trigger Engine (Scheduler/Cron)

Runs periodic checks against your appointments DB:

Finds appointments where appointment_time < now AND status = 'Scheduled' (no check-in logged)
Marks as NoShow
Pushes event to messaging queue

C. Messaging Service

Consumes the queue, decides which template to send based on appointment metadata (prescription vs general), and calls WhatsApp Cloud API.
D. Rebooking Service

Receives button-tap webhook → looks up original appointment → pre-fills new booking Flow → checks slot availability (priority queue if prescription).
2. Data Model (key fields)
Appointment {
  id
  patient_id
  clinic_id
  service_type        // "general" | "prescription_renewal" | "follow_up"
  scheduled_time
  status               // scheduled | reminded | checked_in | no_show | rebooked | completed
  is_priority          // bool, true if prescription/chronic medication
  reminder_count
  last_reminder_sent_at
}

Clinic {
  id, name, address, lat, long
  operating_hours      // per day, incl. holidays
  priority_slots       // reserved slots/day for urgent rebookings
}

Patient {
  id, phone_number, preferred_language, opt_in_status
}
3. Flow Logic (step by step)
Step 1 — Detection

Cron runs every 15 min → flags NoShow appointments.
Step 2 — Branch by type
IF service_type == "prescription_renewal":
   → urgent_reminder_template
   → check priority_slots first when rebooking
ELSE:
   → standard_reminder_template
   → check regular slots
Step 3 — Send reminder (Utility Template, since outside 24hr session window)
Standard:
Hi [Name], you missed your appointment at [Clinic] 
on [Date] at [Time]. Want to rebook?
[Rebook Now] [Call Clinic] [No Thanks]
Prescription/urgent:
⚠️ Hi [Name], you missed your prescription renewal 
appointment at [Clinic]. To avoid a gap in your 
medication, please rebook soon.
[Rebook Now – Priority] [Call Clinic] [No Thanks]
Step 4 — Button webhook received
ButtonActionRebook NowLaunch WhatsApp Flow, pre-filled with clinic + service type, jump to date/time stepCall ClinicSend clinic phone number + tap-to-call linkNo ThanksLog decline, end flow, notify clinic staff dashboard (optional follow-up)
Step 5 — Rebooking Flow (pre-filled)

Skips province/clinic selection
If is_priority = true: query priority_slots table first, fall back to regular slots if none available
Patient picks new date/time → confirmation sent

Step 6 — Escalation if no response
T+0: Reminder 1 sent
T+24h: If no interaction → Reminder 2 (gentler nudge)
T+48h: If still no interaction →
   - flag appointment as "needs_human_followup"
   - notify clinic staff dashboard / call center queue
4. Sequence Diagram (logical)
Cron Job → detects NoShow
   ↓
Messaging Service → checks service_type
   ↓
WhatsApp API → sends Reminder Template (Buttons)
   ↓
Patient taps button → Webhook → Backend
   ↓
   ├── Rebook Now → Flow API → pre-filled booking → Confirmation Template
   ├── Call Clinic → Send clinic contact card
   └── No Thanks → Log + optional staff notification
   ↓
(if no response in 48h) → Escalate to human follow-up queue
5. Why this design works

Template-based, so it works outside the 24-hour free-form messaging window (required by WhatsApp policy)
Priority lane for prescriptions protects patients from medication gaps — clinically important, not just UX nicety
Pre-filled rebooking removes friction — patient doesn't re-enter province/clinic/service
Escalation path ensures vulnerable/non-responsive patients don't fall through the cracks — routes to a human