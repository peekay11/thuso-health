const BookingModel = require('../models/booking.model');
const ClinicModel = require('../models/clinic.model');
const QueueService = require('../services/queue.service');

class BookingController {
  static getBookings(req, res) {
    try {
      const bookings = BookingModel.getAll();
      return res.status(200).json({ success: true, bookings });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static getBookingsByUser(req, res) {
    try {
      const { userId } = req.params;
      const bookings = BookingModel.findByUserId(userId);
      return res.status(200).json({ success: true, bookings });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static createBooking(req, res) {
    try {
      const { userId, clinicId, appointmentTime } = req.body;
      if (!clinicId) {
        return res.status(400).json({ success: false, message: "Clinic ID is required" });
      }

      const clinic = ClinicModel.findById(clinicId);
      if (!clinic) {
        return res.status(404).json({ success: false, message: "Clinic not found" });
      }

      // Calculate waiting time at booking creation
      const estimatedWaitTime = QueueService.calculateEstimatedWaitTime(
        clinic.baseWaitTimeMinutes,
        clinic.currentQueueCount
      );

      const booking = BookingModel.create({
        userId,
        clinicId,
        appointmentTime,
        estimatedWaitTime
      });

      // Increment clinic queue count when booking is confirmed
      ClinicModel.updateQueueCount(clinicId, 1);

      return res.status(201).json({ success: true, booking });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static cancelBooking(req, res) {
    try {
      const { id } = req.params;
      const booking = BookingModel.findById(id);
      if (!booking) {
        return res.status(404).json({ success: false, message: "Booking not found" });
      }

      if (booking.status === "Cancelled" || booking.status === "Completed") {
        return res.status(400).json({ 
          success: false, 
          message: `Booking cannot be cancelled because it is already ${booking.status}` 
        });
      }

      BookingModel.updateStatus(id, "Cancelled");
      
      // Decrement queue count at the clinic
      ClinicModel.updateQueueCount(booking.clinicId, -1);

      return res.status(200).json({ 
        success: true, 
        booking: BookingModel.findById(id), 
        message: "Booking cancelled successfully" 
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static checkInBooking(req, res) {
    try {
      const { id } = req.params;
      const booking = BookingModel.findById(id);
      if (!booking) {
        return res.status(404).json({ success: false, message: "Booking not found" });
      }

      if (booking.status !== "Confirmed") {
        return res.status(400).json({ 
          success: false, 
          message: `Booking cannot be checked in from status ${booking.status}` 
        });
      }

      BookingModel.updateStatus(id, "CheckedIn");

      return res.status(200).json({ 
        success: true, 
        booking: BookingModel.findById(id), 
        message: "Checked-in successfully" 
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static completeBooking(req, res) {
    try {
      const { id } = req.params;
      const booking = BookingModel.findById(id);
      if (!booking) {
        return res.status(404).json({ success: false, message: "Booking not found" });
      }

      BookingModel.updateStatus(id, "Completed");
      
      // Decrement queue count as treatment is done
      ClinicModel.updateQueueCount(booking.clinicId, -1);

      return res.status(200).json({ 
        success: true, 
        booking: BookingModel.findById(id), 
        message: "Booking completed successfully" 
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Bulk sync bookings created offline.
   * Format of req.body: { bookings: [ { clinicId, appointmentTime, offlineId } ] }
   */
  static syncOfflineBookings(req, res) {
    try {
      const { bookings } = req.body;
      if (!Array.isArray(bookings) || bookings.length === 0) {
        return res.status(400).json({ success: false, message: "Invalid or empty bookings list" });
      }

      const syncedBookings = [];
      for (const item of bookings) {
        const { clinicId, appointmentTime, userId } = item;
        const clinic = ClinicModel.findById(clinicId);
        if (clinic) {
          const estimatedWaitTime = QueueService.calculateEstimatedWaitTime(
            clinic.baseWaitTimeMinutes,
            clinic.currentQueueCount
          );
          const booking = BookingModel.create({
            userId: userId || "u1",
            clinicId,
            appointmentTime,
            estimatedWaitTime
          });
          ClinicModel.updateQueueCount(clinicId, 1);
          syncedBookings.push({
            offlineId: item.offlineId || item.id,
            serverBooking: booking
          });
        }
      }

      return res.status(200).json({ success: true, synced: syncedBookings });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = BookingController;
