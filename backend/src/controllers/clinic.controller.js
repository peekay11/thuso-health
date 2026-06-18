const ClinicModel = require('../models/clinic.model');
const QueueService = require('../services/queue.service');

class ClinicController {
  static getAllClinics(req, res) {
    try {
      const clinics = ClinicModel.getAll();
      const clinicsWithWaitTime = clinics.map(c => ({
        ...c,
        estimatedWaitTimeMinutes: QueueService.calculateEstimatedWaitTime(
          c.baseWaitTimeMinutes,
          c.currentQueueCount
        )
      }));
      return res.status(200).json({ success: true, clinics: clinicsWithWaitTime });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static getClinicById(req, res) {
    try {
      const { id } = req.params;
      const clinic = ClinicModel.findById(id);
      if (!clinic) {
        return res.status(404).json({ success: false, message: "Clinic not found" });
      }
      const estimatedWaitTimeMinutes = QueueService.calculateEstimatedWaitTime(
        clinic.baseWaitTimeMinutes,
        clinic.currentQueueCount
      );
      return res.status(200).json({ 
        success: true, 
        clinic: { ...clinic, estimatedWaitTimeMinutes } 
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Searches and ranks clinics based on user's current location coordinates.
   * Path parameters or query parameters: lat, lng
   */
  static getNearbyClinics(req, res) {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ 
          success: false, 
          message: "User latitude (lat) and longitude (lng) are required query parameters" 
        });
      }

      const clinics = ClinicModel.getAll();
      const recommendations = QueueService.getClinicRecommendations(
        clinics, 
        parseFloat(lat), 
        parseFloat(lng)
      );

      return res.status(200).json({ success: true, clinics: recommendations });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = ClinicController;
