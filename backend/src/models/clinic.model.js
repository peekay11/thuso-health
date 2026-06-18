const { db, saveDb } = require('./db');

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
      saveDb();
      return clinic;
    }
    return null;
  }

  static updateClinicDetails(id, details) {
    const clinic = this.findById(id);
    if (clinic) {
      if (details.name !== undefined) clinic.name = details.name;
      if (details.address !== undefined) clinic.address = details.address;
      if (details.capacityPerDay !== undefined) clinic.capacityPerDay = parseInt(details.capacityPerDay, 10);
      if (details.hasElectricity !== undefined) clinic.hasElectricity = !!details.hasElectricity;
      if (details.hasSolar !== undefined) clinic.hasSolar = !!details.hasSolar;
      if (details.services !== undefined) clinic.services = details.services;
      if (details.openTime !== undefined) clinic.openTime = details.openTime;
      if (details.closeTime !== undefined) clinic.closeTime = details.closeTime;
      
      // Sync operatingHours textual representation
      clinic.operatingHours = `${clinic.openTime} - ${clinic.closeTime}`;
      
      saveDb();
      return clinic;
    }
    return null;
  }

  static create(clinicData) {
    const newClinic = {
      id: `c${db.clinics.length + 1}`,
      name: clinicData.name,
      address: clinicData.address,
      lat: parseFloat(clinicData.lat || 0),
      lng: parseFloat(clinicData.lng || 0),
      baseWaitTimeMinutes: parseInt(clinicData.baseWaitTimeMinutes || 30, 10),
      currentQueueCount: 0,
      services: clinicData.services || [],
      capacityPerDay: parseInt(clinicData.capacityPerDay || 50, 10),
      hasElectricity: clinicData.hasElectricity !== undefined ? !!clinicData.hasElectricity : true,
      hasSolar: clinicData.hasSolar !== undefined ? !!clinicData.hasSolar : false,
      openTime: clinicData.openTime || "08:00",
      closeTime: clinicData.closeTime || "17:00",
      operatingHours: `${clinicData.openTime || "08:00"} - ${clinicData.closeTime || "17:00"}`
    };
    db.clinics.push(newClinic);
    saveDb();
    return newClinic;
  }
}

module.exports = ClinicModel;
