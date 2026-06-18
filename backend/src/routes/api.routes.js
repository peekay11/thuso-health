const express = require('express');
const router = express.Router();

const UserController = require('../controllers/user.controller');
const ClinicController = require('../controllers/clinic.controller');
const BookingController = require('../controllers/booking.controller');
const AuthController = require('../controllers/auth.controller');

// Auth Routes
router.post('/auth/login', AuthController.login);
router.post('/auth/register', AuthController.register);

// User Routes
router.get('/users/profile', UserController.getProfile);
router.post('/users/register', UserController.register);

// Clinic Routes
router.get('/clinics', ClinicController.getAllClinics);
router.get('/clinics/nearby', ClinicController.getNearbyClinics);
router.get('/clinics/:id', ClinicController.getClinicById);
router.put('/clinics/:id', ClinicController.updateClinic);

// Booking Routes
router.get('/bookings', BookingController.getBookings);
router.get('/bookings/user/:userId', BookingController.getBookingsByUser);
router.post('/bookings', BookingController.createBooking);
router.post('/bookings/sync', BookingController.syncOfflineBookings);
router.put('/bookings/:id/checkin', BookingController.checkInBooking);
router.put('/bookings/:id/complete', BookingController.completeBooking);
router.delete('/bookings/:id', BookingController.cancelBooking);

module.exports = router;
