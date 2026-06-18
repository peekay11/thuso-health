const request = require('supertest');
const app = require('../src/app');
const { resetDb, db } = require('../src/models/db');

describe('Clinics API Tests', () => {
  beforeEach(() => {
    resetDb();
  });

  describe('GET /api/clinics', () => {
    it('should return a list of all clinics with calculated estimated wait times', async () => {
      const response = await request(app).get('/api/clinics');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.clinics)).toBe(true);
      
      const firstClinic = response.body.clinics[0];
      expect(firstClinic).toHaveProperty('estimatedWaitTimeMinutes');
      expect(firstClinic).toHaveProperty('capacityPerDay');
      expect(firstClinic).toHaveProperty('hasElectricity');
    });
  });

  describe('PUT /api/clinics/:id', () => {
    it('should allow healthcare managers to update clinic attributes', async () => {
      const updatePayload = {
        capacityPerDay: 75,
        hasElectricity: false,
        hasSolar: true,
        openTime: "07:30",
        closeTime: "16:30"
      };

      const response = await request(app)
        .put('/api/clinics/c3')
        .send(updatePayload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      const updated = response.body.clinic;
      expect(updated.capacityPerDay).toBe(75);
      expect(updated.hasElectricity).toBe(false);
      expect(updated.hasSolar).toBe(true);
      expect(updated.openTime).toBe("07:30");
      expect(updated.closeTime).toBe("16:30");
      expect(updated.operatingHours).toBe("07:30 - 16:30");
    });
  });

  describe('GET /api/clinics/nearby', () => {
    it('should return ranked clinics based on user coordinates', async () => {
      const userLat = -26.1929;
      const userLng = 28.0328;

      const response = await request(app)
        .get('/api/clinics/nearby')
        .query({ lat: userLat, lng: userLng });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.clinics.length).toBeGreaterThan(0);

      const firstClinic = response.body.clinics.find(c => c.id === 'c1');
      expect(firstClinic).toBeDefined();
      expect(firstClinic.distanceKm).toBeCloseTo(0, 1);
    });
  });
});
