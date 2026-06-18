// Maps Service handling distance and duration calculations.
// Supports both offline Haversine calculations and holds slots for Google Maps API.

class MapsService {
  /**
   * Calculates the distance and estimated travel time between two coordinates.
   * If Google Maps API key is configured, it would call it. Otherwise, it falls back
   * to a local Haversine formula computation, making it fully offline-functional.
   */
  static calculateDistanceAndDuration(originLat, originLng, destLat, destLng) {
    const lat1 = parseFloat(originLat);
    const lon1 = parseFloat(originLng);
    const lat2 = parseFloat(destLat);
    const lon2 = parseFloat(destLng);

    if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
      return { distanceKm: 0, durationMinutes: 0 };
    }

    // Haversine formula
    const R = 6371; // Earth radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;

    // Estimate driving travel time assuming an average urban speed of 40 km/h
    const averageSpeedKmh = 40;
    const travelTimeHours = distanceKm / averageSpeedKmh;
    const durationMinutes = Math.round(travelTimeHours * 60);

    return {
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      durationMinutes: durationMinutes < 1 ? 1 : durationMinutes
    };
  }

  static deg2rad(deg) {
    return deg * (Math.PI / 180);
  }
}

module.exports = MapsService;
