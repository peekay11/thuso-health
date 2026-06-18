const request = require('supertest');
const app = require('../src/app');
const { resetDb } = require('../src/models/db');

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
      expect(response.body.clinics.length).toBeGreaterThan(0);
      
      // Ensure wait time calculations exist
      const firstClinic = response.body.clinics[0];
      expect(firstClinic).toHaveProperty('estimatedWaitTimeMinutes');
      // wait time = base + currentCount * 10
      expect(firstClinic.estimatedWaitTimeMinutes).toBe(
        firstClinic.baseWaitTimeMinutes + (firstClinic.currentQueueCount * 10)
      );
    });
  });

  describe('GET /api/clinics/nearby', () => {
    it('should return ranked clinics based on user coordinates', async () => {
      // User is in Braamfontein (close to Central Clinic c1)
      const userLat = -26.1929;
      const userLng = 28.0328;

      const response = await request(app)
        .get('/api/clinics/nearby')
        .query({ lat: userLat, lng: userLng });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.clinics.length).toBeGreaterThan(0);

      // Central Clinic (c1) should have distance ~ 0km
      const firstClinic = response.body.clinics.find(c => c.id === 'c1');
      expect(firstClinic).toBeDefined();
      expect(firstClinic.distanceKm).toBeCloseTo(0, 1);
    });

    it('should fail if latitude or longitude are missing', async () => {
      const response = await request(app).get('/api/clinics/nearby');
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
