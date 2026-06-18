const request = require('supertest');
const app = require('../src/app');
const { resetDb, db } = require('../src/models/db');

describe('Bookings API Tests', () => {
  beforeEach(() => {
    resetDb();
  });

  describe('POST /api/bookings', () => {
    it('should create a booking and increment the clinic queue count', async () => {
      const clinicId = 'c3';
      const initialQueueCount = db.clinics.find(c => c.id === clinicId).currentQueueCount;

      const response = await request(app)
        .post('/api/bookings')
        .send({
          userId: 'u1',
          clinicId,
          appointmentTime: new Date(Date.now() + 3600000).toISOString()
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.booking).toHaveProperty('id');
      expect(response.body.booking.clinicId).toBe(clinicId);

      // Verify that the clinic queue count was incremented
      const updatedClinic = db.clinics.find(c => c.id === clinicId);
      expect(updatedClinic.currentQueueCount).toBe(initialQueueCount + 1);
    });
  });

  describe('DELETE /api/bookings/:id', () => {
    it('should cancel an active booking and decrement clinic queue count', async () => {
      // Setup a new booking to cancel
      const clinicId = 'c1';
      const clinic = db.clinics.find(c => c.id === clinicId);
      const prevQueueCount = clinic.currentQueueCount;

      const createResponse = await request(app)
        .post('/api/bookings')
        .send({ userId: 'u1', clinicId });
      
      const bookingId = createResponse.body.booking.id;
      expect(clinic.currentQueueCount).toBe(prevQueueCount + 1);

      // Cancel the booking
      const cancelResponse = await request(app).delete(`/api/bookings/${bookingId}`);
      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.success).toBe(true);
      expect(cancelResponse.body.booking.status).toBe('Cancelled');

      // Verify that clinic queue count decreased back
      expect(clinic.currentQueueCount).toBe(prevQueueCount);
    });
  });

  describe('POST /api/bookings/sync', () => {
    it('should bulk-sync offline bookings', async () => {
      const offlineBookings = [
        { id: 'off-1', clinicId: 'c1', appointmentTime: new Date().toISOString() },
        { id: 'off-2', clinicId: 'c2', appointmentTime: new Date().toISOString() }
      ];

      const response = await request(app)
        .post('/api/bookings/sync')
        .send({ bookings: offlineBookings });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.synced.length).toBe(2);
      expect(response.body.synced[0].offlineId).toBe('off-1');
      expect(response.body.synced[0].serverBooking).toBeDefined();
    });
  });
});
