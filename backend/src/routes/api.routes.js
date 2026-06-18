const express = require('express');
const router = express.Router();

const UserController = require('../controllers/user.controller');
const ClinicController = require('../controllers/clinic.controller');
const BookingController = require('../controllers/booking.controller');
const AuthController = require('../controllers/auth.controller');

const MedicalRecordController = require('../controllers/medicalRecord.controller');

// Auth Routes
router.post('/auth/login', AuthController.login);
router.post('/auth/register', AuthController.register);

// User Routes
router.get('/users/profile', UserController.getProfile);
router.post('/users/register', UserController.register);
router.post('/users/login', UserController.login);

// Clinic Routes
router.get('/clinics', ClinicController.getAllClinics);
router.get('/clinics/nearby', ClinicController.getNearbyClinics);
router.get('/clinics/:id', ClinicController.getClinicById);
router.put('/clinics/:id', ClinicController.updateClinic);

// Booking Routes
router.get('/bookings', BookingController.getBookings);
router.get('/bookings/user/:userId', BookingController.getBookingsByUser);
router.post('/bookings', BookingController.createBooking);
// Note: /bookings/sync is handled by the dedicated bookingRoutes.js mounted in app.js
router.put('/bookings/:id/checkin', BookingController.checkInBooking);
router.put('/bookings/:id/complete', BookingController.completeBooking);
router.delete('/bookings/:id', BookingController.cancelBooking);

// Health Passport Routes
router.get('/patients/:patientId/records', MedicalRecordController.getPatientRecords);
router.post('/patients/:patientId/records', MedicalRecordController.createPatientRecord);
router.get('/patients/:patientId/consent', MedicalRecordController.getConsent);
router.put('/patients/:patientId/consent', MedicalRecordController.updateConsent);
router.get('/patients/:patientId/logs', MedicalRecordController.getLogs);
router.post('/translate', MedicalRecordController.translateNotes);

module.exports = router;
