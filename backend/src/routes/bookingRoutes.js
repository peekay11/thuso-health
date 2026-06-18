const express = require('express');
const router = express.Router();
const BookingModel = require('../models/booking.model');
const ClinicModel = require('../models/clinic.model');
const QueueService = require('../services/queue.service');

/**
 * POST /api/bookings/sync
 * Batch-syncs an array of offline-cached bookings into the database.
 */
router.post('/sync', (req, res) => {
  try {
    const { bookings } = req.body;

    if (!Array.isArray(bookings) || bookings.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Request body must include a non-empty bookings array'
      });
    }

    const syncedBookings = [];

    for (const item of bookings) {
      const { clinicId, appointmentTime, userId } = item;
      const clinic = ClinicModel.findById(clinicId);

      const estimatedWaitTime = clinic
        ? QueueService.calculateEstimatedWaitTime(
            clinic.baseWaitTimeMinutes,
            clinic.currentQueueCount
          )
        : 30;

      const booking = BookingModel.create({
        userId: userId || 'u1',
        clinicId,
        appointmentTime,
        estimatedWaitTime
      });

      if (clinic) {
        ClinicModel.updateQueueCount(clinicId, 1);
      }

      syncedBookings.push(booking);
    }

    return res.status(201).json({
      success: true,
      count: syncedBookings.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
