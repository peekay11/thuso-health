const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/db.json');

// Memory cache of DB
let db = {};

// Initial load
const loadDb = () => {
  try {
    if (fs.existsSync(dbPath)) {
      const content = fs.readFileSync(dbPath, 'utf8');
      db = JSON.parse(content);
      // Ensure new tables are initialized
      if (!db.users) db.users = [];
      if (!db.clinics) db.clinics = [];
      if (!db.bookings) db.bookings = [];
      if (!db.medical_records) db.medical_records = [];
      if (!db.audit_logs) db.audit_logs = [];
    } else {
      // Create with default empty structure if it doesn't exist
      db = { users: [], clinics: [], bookings: [], medical_records: [], audit_logs: [] };
      saveDb();
    }
  } catch (error) {
    console.error("Error loading db.json, using fallback", error);
    db = { users: [], clinics: [], bookings: [], medical_records: [], audit_logs: [] };
  }
};

const saveDb = () => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error("Error saving db.json", error);
  }
};

// Seed/Reset database (useful for running tests)
const resetDb = () => {
  db = {
    users: [
      {
        id: "u1",
        name: "Paseka Moloi",
        email: "paseka@thuso.health",
        phone: "+27 82 123 4567",
        role: "patient",
        thuso_id_hash: "thuso_u1_hash",
        consentPin: "1234",
        isAccessGranted: true,
        language: "en"
      },
      {
        id: "u2",
        name: "Dr. Sarah Dube",
        email: "sarah@thuso.health",
        phone: "+27 83 987 6543",
        role: "healthcare",
        clinicId: "c3",
        password: "password123"
      }
    ],
    clinics: [
      {
        id: "c1",
        name: "Thuso Health Central Clinic",
        address: "26 Jorissen St, Braamfontein, Johannesburg, 2001",
        lat: -26.1929,
        lng: 28.0328,
        baseWaitTimeMinutes: 45,
        currentQueueCount: 12,
        services: ["General Practitioner", "Dentistry", "Pediatrics", "Vaccinations"],
        operatingHours: "08:00 - 17:00",
        capacityPerDay: 80,
        hasElectricity: true,
        hasSolar: false,
        openTime: "08:00",
        closeTime: "17:00"
      },
      {
        id: "c2",
        name: "Hillbrow Community Health Centre",
        address: "Smith St & Klein St, Hillbrow, Johannesburg, 2001",
        lat: -26.1884,
        lng: 28.0443,
        baseWaitTimeMinutes: 90,
        currentQueueCount: 28,
        services: ["General Practitioner", "HIV/AIDS Care", "Maternity", "Pharmacy"],
        operatingHours: "24 Hours",
        capacityPerDay: 150,
        hasElectricity: false,
        hasSolar: false,
        openTime: "00:00",
        closeTime: "23:59"
      },
      {
        id: "c3",
        name: "Parktown Medical Centre",
        address: "15 Princess of Wales Terrace, Parktown, Johannesburg, 2193",
        lat: -26.1772,
        lng: 28.0308,
        baseWaitTimeMinutes: 20,
        currentQueueCount: 3,
        services: ["General Practitioner", "Physiotherapy", "Optometry"],
        operatingHours: "08:00 - 18:00",
        capacityPerDay: 40,
        hasElectricity: true,
        hasSolar: true,
        openTime: "08:00",
        closeTime: "18:00"
      },
      {
        id: "c4",
        name: "Rosebank Health Clinic",
        address: "50 Bath Ave, Rosebank, Johannesburg, 2196",
        lat: -26.1460,
        lng: 28.0371,
        baseWaitTimeMinutes: 15,
        currentQueueCount: 2,
        services: ["General Practitioner", "Travel Clinic", "Dermatology"],
        operatingHours: "09:00 - 17:00",
        capacityPerDay: 30,
        hasElectricity: true,
        hasSolar: true,
        openTime: "09:00",
        closeTime: "17:00"
      }
    ],
    bookings: [
      {
        id: "b1",
        userId: "u1",
        clinicId: "c1",
        bookingTime: new Date(Date.now() - 3600000).toISOString(),
        appointmentTime: new Date(Date.now() + 7200000).toISOString(),
        status: "Confirmed",
        queueNumber: "T-101",
        estimatedWaitTime: 35
      }
    ],
    medical_records: [
      {
        record_id: 1,
        patient_id: "u1",
        doctor_id: "u2",
        doctor_name: "Dr. Sarah Dube",
        clinic_name: "Parktown Medical Centre",
        diagnosis: "Mild respiratory infection",
        treatment_plan: "Bed rest and hydration",
        medication_prescribed: "Paracetamol 500mg, Vitamin C",
        file_url_r2: "https://r2.thuso.health/reports/u1-rec1.pdf",
        created_at: new Date(Date.now() - 86400000 * 2).toISOString()
      }
    ],
    audit_logs: [
      {
        log_id: 1,
        timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
        practitioner_id: "u2",
        practitioner_name: "Dr. Sarah Dube",
        patient_id: "u1",
        action: "WRITE_RECORD"
      }
    ]
  };
  saveDb();
};

// Initial load on import
loadDb();

module.exports = {
  db,
  resetDb,
  saveDb
};
