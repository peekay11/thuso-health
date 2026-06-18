const {
  calculateDistance,
  calculateTotalTime,
  rankClinics
} = require('../../src/services/queueService');

describe('QueueService Tests', () => {
  describe('calculateDistance', () => {
    it('should compute the Haversine distance between Soweto and Johannesburg Central correctly', () => {
      // Soweto: -26.2678, 27.8585
      // Johannesburg Central: -26.2041, 28.0473
      const dist = calculateDistance(-26.2678, 27.8585, -26.2041, 28.0473);
      // Expected distance is approximately 20.12 km
      expect(dist).toBeCloseTo(20.12, 1);
    });

    it('should return 0 for identical coordinates', () => {
      const dist = calculateDistance(-26.2041, 28.0473, -26.2041, 28.0473);
      expect(dist).toBe(0);
    });
  });

  describe('calculateTotalTime', () => {
    it('should correctly calculate total time based on 5km/h walking speed and 15 mins per patient wait time', () => {
      // 10 km distance, 2 patients in queue
      // Travel: 10 / 5 = 2 hours = 120 minutes
      // Wait: 2 * 15 = 30 minutes
      // Total: 150 minutes
      const totalTime = calculateTotalTime(10, 2);
      expect(totalTime).toBe(150);
    });

    it('should return 0 when distance and queue count are both 0', () => {
      const totalTime = calculateTotalTime(0, 0);
      expect(totalTime).toBe(0);
    });
  });

  describe('rankClinics', () => {
    it('should calculate travel/wait times and sort clinics by total time ascending', () => {
      const patientLocation = { lat: -26.2678, lng: 27.8585 }; // Soweto
      
      const clinicsList = [
        {
          id: 'c1',
          name: 'Clinic Busy Close',
          lat: -26.2041, // Johannesburg Central (~22.56 km)
          lng: 28.0473,
          currentQueueCount: 15 // wait time = 225 minutes, travel time ~ 271 minutes -> Total ~ 496 minutes
        },
        {
          id: 'c2',
          name: 'Clinic Empty Far',
          lat: -25.7479, // Pretoria (~69.1 km)
          lng: 28.2293,
          currentQueueCount: 0 // wait time = 0 minutes, travel time ~ 829 minutes -> Total ~ 829 minutes
        },
        {
          id: 'c3',
          name: 'Clinic Quiet Close',
          lat: -26.2041, // Johannesburg Central (~22.56 km)
          lng: 28.0473,
          currentQueueCount: 1 // wait time = 15 minutes, travel time ~ 271 minutes -> Total ~ 286 minutes
        }
      ];

      const ranked = rankClinics(patientLocation, clinicsList);

      expect(ranked).toHaveLength(3);
      // c3 should be first (shortest total time)
      expect(ranked[0].id).toBe('c3');
      // c1 should be second
      expect(ranked[1].id).toBe('c1');
      // c2 should be third (longest total time)
      expect(ranked[2].id).toBe('c2');

      // Check that computed fields are attached
      expect(ranked[0]).toHaveProperty('distanceKm');
      expect(ranked[0]).toHaveProperty('travelTimeMinutes');
      expect(ranked[0]).toHaveProperty('estimatedWaitTimeMinutes');
      expect(ranked[0]).toHaveProperty('totalTimeMinutes');
    });
  });
});
