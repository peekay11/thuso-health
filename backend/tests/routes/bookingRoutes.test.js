const request = require('supertest');
const app = require('../../src/app');
const { resetDb, db } = require('../../src/models/db');

describe('POST /api/bookings/sync - Batch Synchronization Engine', () => {
  beforeEach(() => {
    resetDb();
  });

  describe('Happy Path', () => {
    it('should accept an array of offline bookings, save them all, and return 201 with synced count', async () => {
      const initialBookingCount = db.bookings.length;

      const offlineBookings = [
        {
          offlineId: 'offline-001',
          userId: 'u1',
          clinicId: 'c1',
          appointmentTime: new Date(Date.now() + 3600000).toISOString()
        },
        {
          offlineId: 'offline-002',
          userId: 'u1',
          clinicId: 'c3',
          appointmentTime: new Date(Date.now() + 7200000).toISOString()
        }
      ];

      const response = await request(app)
        .post('/api/bookings/sync')
        .send({ bookings: offlineBookings });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);

      // Verify bookings were actually persisted in the database
      expect(db.bookings.length).toBe(initialBookingCount + 2);
    });

    it('should correctly assign synced bookings a Confirmed status and queue number', async () => {
      const offlineBookings = [
        {
          offlineId: 'offline-003',
          userId: 'u1',
          clinicId: 'c4',
          appointmentTime: new Date(Date.now() + 3600000).toISOString()
        }
      ];

      const response = await request(app)
        .post('/api/bookings/sync')
        .send({ bookings: offlineBookings });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);

      // Verify newly created booking has correct fields
      const newBooking = db.bookings[db.bookings.length - 1];
      expect(newBooking.status).toBe('Confirmed');
      expect(newBooking).toHaveProperty('queueNumber');
      expect(newBooking.clinicId).toBe('c4');
    });
  });

  describe('Validation - 400 Bad Request', () => {
    it('should return 400 if the bookings field is missing from the payload', async () => {
      const response = await request(app)
        .post('/api/bookings/sync')
        .send({ data: 'no bookings field here' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if the bookings array is empty', async () => {
      const response = await request(app)
        .post('/api/bookings/sync')
        .send({ bookings: [] });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if bookings is not an array', async () => {
      const response = await request(app)
        .post('/api/bookings/sync')
        .send({ bookings: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Error Handling - 500 Internal Server Error', () => {
    it('should gracefully catch errors during batch insertion and return a structured error response', async () => {
      // Inject a booking with a deliberately invalid clinicId to force a DB-level issue
      // We mock BookingModel.create to throw for this test
      const BookingModel = require('../../src/models/booking.model');
      const originalCreate = BookingModel.create;
      BookingModel.create = () => { throw new Error('Simulated DB insertion failure'); };

      const offlineBookings = [
        { offlineId: 'err-001', userId: 'u1', clinicId: 'c1', appointmentTime: new Date().toISOString() }
      ];

      const response = await request(app)
        .post('/api/bookings/sync')
        .send({ bookings: offlineBookings });

      // Restore the original method
      BookingModel.create = originalCreate;

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });
  });
});
