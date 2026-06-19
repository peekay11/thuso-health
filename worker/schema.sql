-- Thuso Health D1 Database Schema
-- Run: wrangler d1 execute thuso-health-db --file=./schema.sql
-- For local dev: wrangler d1 execute thuso-health-db --local --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'patient',
  clinic_id TEXT,
  thuso_id_hash TEXT,
  consent_pin TEXT DEFAULT '1234',
  is_access_granted INTEGER DEFAULT 1,
  language TEXT DEFAULT 'en',
  notify_medications INTEGER DEFAULT 1,
  notify_appointments INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  base_wait_time_minutes INTEGER DEFAULT 30,
  current_queue_count INTEGER DEFAULT 0,
  services TEXT DEFAULT '[]',
  operating_hours TEXT DEFAULT '08:00 - 17:00',
  capacity_per_day INTEGER DEFAULT 50,
  has_electricity INTEGER DEFAULT 1,
  has_solar INTEGER DEFAULT 0,
  open_time TEXT DEFAULT '08:00',
  close_time TEXT DEFAULT '17:00',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  clinic_id TEXT NOT NULL,
  patient_name TEXT,
  patient_phone TEXT,
  booking_time TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  status TEXT DEFAULT 'Confirmed',
  queue_number TEXT NOT NULL,
  estimated_wait_time INTEGER DEFAULT 30,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medical_records (
  record_id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  doctor_id TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment_plan TEXT,
  medication_prescribed TEXT,
  file_url_r2 TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  practitioner_id TEXT NOT NULL,
  practitioner_name TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  action TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'MENU',
  data TEXT NOT NULL DEFAULT '{}',
  user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
