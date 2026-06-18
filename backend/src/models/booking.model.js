const { db } = require('./db');

class BookingModel {
  static getAll() {
    return db.bookings;
  }

  static findById(id) {
    return db.bookings.find(b => b.id === id);
  }

  static findByUserId(userId) {
    return db.bookings.filter(b => b.userId === userId);
  }

  static findByClinicId(clinicId) {
    return db.bookings.filter(b => b.clinicId === clinicId);
  }

  static create(bookingData) {
    const queuePrefix = bookingData.clinicId.toUpperCase();
    const clinicBookings = this.findByClinicId(bookingData.clinicId);
    const queueNum = clinicBookings.length + 101;
    
    const newBooking = {
      id: `b${db.bookings.length + 1}`,
      userId: bookingData.userId || "u1", // fallback to default user
      clinicId: bookingData.clinicId,
      bookingTime: new Date().toISOString(),
      appointmentTime: bookingData.appointmentTime || new Date(Date.now() + 3600000).toISOString(), // defaults to 1 hour from now
      status: "Confirmed",
      queueNumber: `${queuePrefix}-${queueNum}`,
      estimatedWaitTime: parseInt(bookingData.estimatedWaitTime || 30, 10)
    };
    db.bookings.push(newBooking);
    return newBooking;
  }

  static updateStatus(id, status) {
    const booking = this.findById(id);
    if (booking) {
      booking.status = status;
      return booking;
    }
    return null;
  }
}

module.exports = BookingModel;
