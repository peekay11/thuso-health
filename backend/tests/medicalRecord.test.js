const request = require('supertest');
const app = require('../src/app');
const { resetDb, db } = require('../src/models/db');

describe('Digital Health Passport API Endpoints', () => {
  beforeEach(() => {
    resetDb();
  });

  describe('GET /api/patients/:patientId/consent', () => {
    it('should return consent settings for a valid patient', async () => {
      const res = await request(app).get('/api/patients/u1/consent');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.consent).toHaveProperty('consentPin', '1234');
      expect(res.body.consent).toHaveProperty('isAccessGranted', true);
    });

    it('should return 404 for an invalid patient', async () => {
      const res = await request(app).get('/api/patients/invalidPatient/consent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/patients/:patientId/consent', () => {
    it('should update consent settings successfully', async () => {
      const payload = {
        consentPin: '9999',
        isAccessGranted: false,
        language: 'zulu'
      };

      const res = await request(app)
        .put('/api/patients/u1/consent')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.consent.consentPin).toBe('9999');
      expect(res.body.consent.isAccessGranted).toBe(false);
      expect(res.body.consent.language).toBe('zulu');

      // Check DB
      const user = db.users.find(u => u.id === 'u1');
      expect(user.consentPin).toBe('9999');
      expect(user.isAccessGranted).toBe(false);
    });
  });

  describe('GET /api/patients/:patientId/records', () => {
    it('should allow patient to fetch their own records without doctor credentials', async () => {
      const res = await request(app).get('/api/patients/u1/records');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.records).toBeInstanceOf(Array);
      expect(res.body.records.length).toBe(1);
    });

    it('should allow doctor to access patient records if patient has enabled global consent', async () => {
      // Set global consent to true
      db.users.find(u => u.id === 'u1').isAccessGranted = true;

      const res = await request(app)
        .get('/api/patients/u1/records')
        .query({ doctorId: 'u2' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify audit log was created
      const logs = db.audit_logs.filter(l => l.patient_id === 'u1' && l.action === 'READ_PASSPORT');
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should allow doctor to access patient records with correct PIN if global consent is disabled', async () => {
      // Set global consent to false
      db.users.find(u => u.id === 'u1').isAccessGranted = false;
      db.users.find(u => u.id === 'u1').consentPin = '4321';

      const res = await request(app)
        .get('/api/patients/u1/records')
        .query({ doctorId: 'u2', pin: '4321' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should block doctor from patient records if global consent is disabled and PIN is incorrect', async () => {
      db.users.find(u => u.id === 'u1').isAccessGranted = false;
      db.users.find(u => u.id === 'u1').consentPin = '4321';

      const res = await request(app)
        .get('/api/patients/u1/records')
        .query({ doctorId: 'u2', pin: '0000' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Access denied');
    });
  });

  describe('POST /api/patients/:patientId/records', () => {
    it('should successfully add a medical record for a doctor and generate R2 link', async () => {
      const payload = {
        doctorId: 'u2',
        diagnosis: 'Hypertension',
        treatment_plan: 'Take medication daily after breakfast',
        medication_prescribed: 'Amlodipine 5mg'
      };

      const res = await request(app)
        .post('/api/patients/u1/records')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.record.diagnosis).toBe('Hypertension');
      expect(res.body.record).toHaveProperty('file_url_r2');
      expect(res.body.record.file_url_r2).toContain('r2.thuso.health');

      // Verify audit log was created
      const logs = db.audit_logs.filter(l => l.patient_id === 'u1' && l.action === 'WRITE_RECORD');
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/patients/:patientId/logs', () => {
    it('should return POPIA audit logs for patient', async () => {
      const res = await request(app).get('/api/patients/u1/logs');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.logs).toBeInstanceOf(Array);
      expect(res.body.logs.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/translate', () => {
    it('should translate text to zulu successfully', async () => {
      const payload = {
        text: 'Mild respiratory infection',
        targetLanguage: 'zulu'
      };

      const res = await request(app)
        .post('/api/translate')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.translatedText).toBe('Ukwetheleleka okuncane kokuphefumula');
    });

    it('should use fallback translation for unmapped texts', async () => {
      const payload = {
        text: 'Unknown medical note text',
        targetLanguage: 'sesotho'
      };

      const res = await request(app)
        .post('/api/translate')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.translatedText).toBe('[Translated to sesotho] Unknown medical note text');
    });
  });
});
