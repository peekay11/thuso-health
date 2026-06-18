const { db, saveDb } = require('./db');

class MedicalRecordModel {
  static getAllByPatientId(patientId) {
    if (!db.medical_records) {
      db.medical_records = [];
    }
    return db.medical_records.filter(r => r.patient_id === patientId);
  }

  static create(recordData) {
    if (!db.medical_records) {
      db.medical_records = [];
    }
    const newRecord = {
      record_id: db.medical_records.length + 1,
      patient_id: recordData.patient_id,
      doctor_id: recordData.doctor_id,
      doctor_name: recordData.doctor_name || 'Doctor',
      clinic_name: recordData.clinic_name || 'Clinic',
      diagnosis: recordData.diagnosis,
      treatment_plan: recordData.treatment_plan || '',
      medication_prescribed: recordData.medication_prescribed || '',
      // Use provided R2 URL or generate a placeholder (replaced by real Cloudflare R2 on upload)
      file_url_r2: recordData.file_url_r2 || `https://r2.thuso.health/reports/${recordData.patient_id}-r${Date.now()}.pdf`,
      created_at: new Date().toISOString()
    };
    db.medical_records.push(newRecord);
    saveDb();
    return newRecord;
  }

  static getConsent(patientId) {
    const user = db.users.find(u => u.id === patientId);
    if (!user) return null;
    return {
      consentPin: user.consentPin || "1234",
      isAccessGranted: user.isAccessGranted === true,
      thuso_id_hash: user.thuso_id_hash || `thuso_${patientId}_hash`,
      language: user.language || "en"
    };
  }

  static updateConsent(patientId, consentData) {
    const user = db.users.find(u => u.id === patientId);
    if (!user) return null;
    if (consentData.consentPin !== undefined) user.consentPin = consentData.consentPin;
    if (consentData.isAccessGranted !== undefined) user.isAccessGranted = consentData.isAccessGranted === true;
    if (consentData.language !== undefined) user.language = consentData.language;
    if (consentData.notifyMedications !== undefined) user.notifyMedications = consentData.notifyMedications === true;
    if (consentData.notifyAppointments !== undefined) user.notifyAppointments = consentData.notifyAppointments === true;
    saveDb();
    return {
      consentPin: user.consentPin,
      isAccessGranted: user.isAccessGranted,
      thuso_id_hash: user.thuso_id_hash,
      language: user.language,
      notifyMedications: user.notifyMedications !== false,
      notifyAppointments: user.notifyAppointments !== false
    };
  }

  static getLogs(patientId) {
    if (!db.audit_logs) {
      db.audit_logs = [];
    }
    return db.audit_logs.filter(l => l.patient_id === patientId);
  }

  static createAuditLog(practitionerId, practitionerName, patientId, action) {
    if (!db.audit_logs) {
      db.audit_logs = [];
    }
    const newLog = {
      log_id: db.audit_logs.length + 1,
      timestamp: new Date().toISOString(),
      practitioner_id: practitionerId,
      practitioner_name: practitionerName,
      patient_id: patientId,
      action: action
    };
    db.audit_logs.push(newLog);
    saveDb();
    return newLog;
  }
}

module.exports = MedicalRecordModel;
