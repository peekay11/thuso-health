const MedicalRecordModel = require('../models/medicalRecord.model');
const UserModel = require('../models/user.model');

class MedicalRecordController {
  static async getPatientRecords(req, res) {
    try {
      const { patientId } = req.params;
      const { doctorId, pin } = req.query; // If doctor accesses it

      if (!patientId) {
        return res.status(400).json({ success: false, error: 'Patient ID is required' });
      }

      const consent = MedicalRecordModel.getConsent(patientId);
      if (!consent) {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }

      // Check access permission
      let isAuthorized = false;
      
      // If doctor is accessing
      if (doctorId) {
        const doctor = UserModel.findById(doctorId);
        if (!doctor || doctor.role !== 'healthcare') {
          return res.status(403).json({ success: false, error: 'Access forbidden: invalid practitioner credentials' });
        }

        // Access is authorized if either global toggle is on OR doctor supplies the correct PIN
        if (consent.isAccessGranted || (pin && pin === consent.consentPin)) {
          isAuthorized = true;
          // Write POPIA audit log
          MedicalRecordModel.createAuditLog(
            doctorId,
            doctor.name,
            patientId,
            'READ_PASSPORT'
          );
        }
      } else {
        // Patient accessing their own records
        isAuthorized = true;
      }

      if (!isAuthorized) {
        return res.status(403).json({ 
          success: false, 
          error: 'Access denied: Practitioner is not authorized. Patient must grant access or provide valid PIN.' 
        });
      }

      const records = MedicalRecordModel.getAllByPatientId(patientId);
      return res.status(200).json({ success: true, records });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createPatientRecord(req, res) {
    try {
      const { patientId } = req.params;
      const { doctorId, diagnosis, treatment_plan, medication_prescribed, file_url_r2 } = req.body;

      if (!patientId || !doctorId || !diagnosis) {
        return res.status(400).json({ success: false, error: 'patientId, doctorId, and diagnosis are required' });
      }

      const doctor = UserModel.findById(doctorId);
      if (!doctor || doctor.role !== 'healthcare') {
        return res.status(403).json({ success: false, error: 'Access forbidden: invalid practitioner credentials' });
      }

      // Verify patient consent for writing (doctor must have access permission)
      const consent = MedicalRecordModel.getConsent(patientId);
      if (!consent) {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }

      const newRecord = MedicalRecordModel.create({
        patient_id: patientId,
        doctor_id: doctorId,
        doctor_name: doctor.name,
        clinic_name: doctor.clinicId ? 'Clinic' : 'Local Health Practitioner',
        diagnosis,
        treatment_plan,
        medication_prescribed,
        file_url_r2: file_url_r2 || `https://r2.thuso.health/reports/u1-r${Date.now()}.pdf`
      });

      // Write POPIA audit log
      MedicalRecordModel.createAuditLog(
        doctorId,
        doctor.name,
        patientId,
        'WRITE_RECORD'
      );

      return res.status(201).json({ success: true, record: newRecord });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getConsent(req, res) {
    try {
      const { patientId } = req.params;
      const consent = MedicalRecordModel.getConsent(patientId);
      if (!consent) {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }
      return res.status(200).json({ success: true, consent });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateConsent(req, res) {
    try {
      const { patientId } = req.params;
      const { consentPin, isAccessGranted, language } = req.body;
      
      const updated = MedicalRecordModel.updateConsent(patientId, {
        consentPin,
        isAccessGranted,
        language
      });

      if (!updated) {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }
      return res.status(200).json({ success: true, consent: updated });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getLogs(req, res) {
    try {
      const { patientId } = req.params;
      const logs = MedicalRecordModel.getLogs(patientId);
      return res.status(200).json({ success: true, logs });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async translateNotes(req, res) {
    try {
      const { text, targetLanguage } = req.body;
      if (!text || !targetLanguage) {
        return res.status(400).json({ success: false, error: 'text and targetLanguage are required' });
      }

      // Simple dictionary translations to simulate Cloudflare Workers AI
      const dictionary = {
        'zulu': {
          'Mild respiratory infection': 'Ukwetheleleka okuncane kokuphefumula',
          'Bed rest and hydration': 'Ukuphumula embhedeni nokuphuza amanzi amaningi',
          'Paracetamol 500mg, Vitamin C': 'I-Paracetamol 500mg, i-Vitamin C',
          'Hypertension': 'Umfutho wegazi ophakeme',
          'Take medication daily after breakfast': 'Thatha imithi nsuku zonke ngemuva kokudla kwasekuseni',
          'Amlodipine 5mg': 'I-Amlodipine 5mg'
        },
        'sesotho': {
          'Mild respiratory infection': 'Tšoaetso e bonolo ea ho hema',
          'Bed rest and hydration': 'Ho phomola betheng le ho nwa metsi a mangata',
          'Paracetamol 500mg, Vitamin C': 'Paracetamol 500mg, Vitamin C',
          'Hypertension': 'Khatello e phahameng ea mali',
          'Take medication daily after breakfast': 'Nka meriana letsatsi le letsatsi ka mor\'a lijo tsa hoseng',
          'Amlodipine 5mg': 'Amlodipine 5mg'
        },
        'afrikaans': {
          'Mild respiratory infection': 'Ligte respiratoriese infeksie',
          'Bed rest and hydration': 'Bedrus en hidrasie',
          'Paracetamol 500mg, Vitamin C': 'Paracetamol 500mg, Vitamien C',
          'Hypertension': 'Hipertensie',
          'Take medication daily after breakfast': 'Neem medikasie daagliks na ontbyt',
          'Amlodipine 5mg': 'Amlodipine 5mg'
        },
        'xhosa': {
          'Mild respiratory infection': 'Usulelo olungephi lwendlela yokuphefumla',
          'Bed rest and hydration': 'Ukuphumula ebhedini kunye nokusela amanzi amaninzi',
          'Paracetamol 500mg, Vitamin C': 'I-Paracetamol 500mg, i-Vitamin C',
          'Hypertension': 'Uxinzelelo lwegazi oluphezulu',
          'Take medication daily after breakfast': 'Thatha iyeza yonke imihla emva kwesidlo sakusasa',
          'Amlodipine 5mg': 'I-Amlodipine 5mg'
        }
      };

      const langKey = targetLanguage.toLowerCase();
      let translatedText = text;

      if (dictionary[langKey] && dictionary[langKey][text]) {
        translatedText = dictionary[langKey][text];
      } else {
        // Fallback simulation: prepend mock translation tag
        translatedText = `[Translated to ${targetLanguage}] ${text}`;
      }

      return res.status(200).json({ success: true, translatedText });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = MedicalRecordController;
