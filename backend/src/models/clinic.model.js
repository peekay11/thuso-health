const { db } = require('./db');

class ClinicModel {
  static getAll() {
    return db.clinics;
  }

  static findById(id) {
    return db.clinics.find(c => c.id === id);
  }

  static updateQueueCount(id, increment = 1) {
    const clinic = this.findById(id);
    if (clinic) {
      clinic.currentQueueCount = Math.max(0, clinic.currentQueueCount + increment);
      return clinic;
    }
    return null;
  }

  static create(clinicData) {
    const newClinic = {
      id: `c${db.clinics.length + 1}`,
      name: clinicData.name,
      address: clinicData.address,
      lat: parseFloat(clinicData.lat),
      lng: parseFloat(clinicData.lng),
      baseWaitTimeMinutes: parseInt(clinicData.baseWaitTimeMinutes || 30, 10),
      currentQueueCount: 0,
      services: clinicData.services || [],
      operatingHours: clinicData.operatingHours || "08:00 - 17:00"
    };
    db.clinics.push(newClinic);
    return newClinic;
  }
}

module.exports = ClinicModel;
