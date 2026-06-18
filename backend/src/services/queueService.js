/**
 * Haversine formula to compute distance between two geo-coordinates.
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
      
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculates total time (travel time + waiting room queue wait time).
 * Walking speed is assumed to be 5 km/h. Wait time is 15 mins per patient.
 */
const calculateTotalTime = (distanceKm, currentQueueCount) => {
  const walkingSpeedKmh = 5;
  const waitTimePerPatientMinutes = 15;
  
  const travelTimeMinutes = (distanceKm / walkingSpeedKmh) * 60;
  const estimatedWaitTimeMinutes = currentQueueCount * waitTimePerPatientMinutes;
  
  return travelTimeMinutes + estimatedWaitTimeMinutes;
};

/**
 * Ranks clinics by calculating total time for each from patient location,
 * then sorting in ascending order.
 */
const rankClinics = (patientLocation, clinicsList) => {
  const ranked = clinicsList.map((clinic) => {
    const distanceKm = calculateDistance(
      patientLocation.lat,
      patientLocation.lng,
      clinic.lat,
      clinic.lng
    );
    
    const walkingSpeedKmh = 5;
    const waitTimePerPatientMinutes = 15;
    
    const travelTimeMinutes = (distanceKm / walkingSpeedKmh) * 60;
    const estimatedWaitTimeMinutes = clinic.currentQueueCount * waitTimePerPatientMinutes;
    const totalTimeMinutes = travelTimeMinutes + estimatedWaitTimeMinutes;
    
    return {
      ...clinic,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      travelTimeMinutes: Math.round(travelTimeMinutes),
      estimatedWaitTimeMinutes,
      totalTimeMinutes: Math.round(totalTimeMinutes)
    };
  });
  
  return ranked.sort((a, b) => a.totalTimeMinutes - b.totalTimeMinutes);
};

module.exports = {
  calculateDistance,
  calculateTotalTime,
  rankClinics
};
