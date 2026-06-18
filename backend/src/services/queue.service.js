const MapsService = require('./maps.service');

class QueueService {
  /**
   * Calculates the real-time estimated wait time for a clinic.
   * Logic: Base waiting time + (Current queue size * Average processing time per patient)
   * Average patient service time is assumed to be 10 minutes.
   */
  static calculateEstimatedWaitTime(baseWaitTimeMinutes, currentQueueCount) {
    const minutesPerPatient = 10;
    return baseWaitTimeMinutes + (currentQueueCount * minutesPerPatient);
  }

  /**
   * Evaluates clinics and returns recommendations based on proximity and wait times.
   * Helps user decide whether to go to a close but busy clinic, or a slightly further but empty clinic.
   */
  static getClinicRecommendations(clinics, userLat, userLng) {
    return clinics.map(clinic => {
      const { distanceKm, durationMinutes: travelTimeMinutes } = 
        MapsService.calculateDistanceAndDuration(userLat, userLng, clinic.lat, clinic.lng);

      const estimatedWaitTimeMinutes = this.calculateEstimatedWaitTime(
        clinic.baseWaitTimeMinutes, 
        clinic.currentQueueCount
      );

      // Total time is Travel Time + Waiting Room Time
      const totalTimeMinutes = travelTimeMinutes + estimatedWaitTimeMinutes;

      return {
        ...clinic,
        distanceKm,
        travelTimeMinutes,
        estimatedWaitTimeMinutes,
        totalTimeMinutes,
        // Recommended rank: Lower total time is better
        score: totalTimeMinutes
      };
    }).sort((a, b) => a.score - b.score);
  }
}

module.exports = QueueService;
