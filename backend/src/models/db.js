// In-Memory Database representing Thuso Health persistent data
const db = {
  users: [
    {
      id: "u1",
      name: "Paseka Moloi",
      email: "paseka@thuso.health",
      phone: "+27 82 123 4567"
    }
  ],
  clinics: [
    {
      id: "c1",
      name: "Thuso Health Central Clinic",
      address: "26 Jorissen St, Braamfontein, Johannesburg, 2001",
      lat: -26.1929,
      lng: 28.0328,
      baseWaitTimeMinutes: 45, // Average waiting time in minutes
      currentQueueCount: 12,
      services: ["General Practitioner", "Dentistry", "Pediatrics", "Vaccinations"],
      operatingHours: "08:00 - 17:00"
    },
    {
      id: "c2",
      name: "Hillbrow Community Health Centre",
      address: "Smith St & Klein St, Hillbrow, Johannesburg, 2001",
      lat: -26.1884,
      lng: 28.0443,
      baseWaitTimeMinutes: 90,
      currentQueueCount: 28,
      services: ["General Practitioner", "HIV/AIDS Care", "Maternity", "Pharmacy"],
      operatingHours: "24 Hours"
    },
    {
      id: "c3",
      name: "Parktown Medical Centre",
      address: "15 Princess of Wales Terrace, Parktown, Johannesburg, 2193",
      lat: -26.1772,
      lng: 28.0308,
      baseWaitTimeMinutes: 20,
      currentQueueCount: 3,
      services: ["General Practitioner", "Physiotherapy", "Optometry"],
      operatingHours: "08:00 - 18:00"
    },
    {
      id: "c4",
      name: "Rosebank Health Clinic",
      address: "50 Bath Ave, Rosebank, Johannesburg, 2196",
      lat: -26.1460,
      lng: 28.0371,
      baseWaitTimeMinutes: 15,
      currentQueueCount: 2,
      services: ["General Practitioner", "Travel Clinic", "Dermatology"],
      operatingHours: "09:00 - 17:00"
    }
  ],
  bookings: [
    {
      id: "b1",
      userId: "u1",
      clinicId: "c1",
      bookingTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      appointmentTime: new Date(Date.now() + 7200000).toISOString(), // 2 hours from now
      status: "Confirmed", // Confirmed, CheckedIn, Completed, Cancelled
      queueNumber: "T-101",
      estimatedWaitTime: 35
    }
  ]
};

// Helper methods to reset DB (useful for tests)
const resetDb = () => {
  db.users = [
    {
      id: "u1",
      name: "Paseka Moloi",
      email: "paseka@thuso.health",
      phone: "+27 82 123 4567"
    }
  ];
  db.clinics = [
    {
      id: "c1",
      name: "Thuso Health Central Clinic",
      address: "26 Jorissen St, Braamfontein, Johannesburg, 2001",
      lat: -26.1929,
      lng: 28.0328,
      baseWaitTimeMinutes: 45,
      currentQueueCount: 12,
      services: ["General Practitioner", "Dentistry", "Pediatrics", "Vaccinations"],
      operatingHours: "08:00 - 17:00"
    },
    {
      id: "c2",
      name: "Hillbrow Community Health Centre",
      address: "Smith St & Klein St, Hillbrow, Johannesburg, 2001",
      lat: -26.1884,
      lng: 28.0443,
      baseWaitTimeMinutes: 90,
      currentQueueCount: 28,
      services: ["General Practitioner", "HIV/AIDS Care", "Maternity", "Pharmacy"],
      operatingHours: "24 Hours"
    },
    {
      id: "c3",
      name: "Parktown Medical Centre",
      address: "15 Princess of Wales Terrace, Parktown, Johannesburg, 2193",
      lat: -26.1772,
      lng: 28.0308,
      baseWaitTimeMinutes: 20,
      currentQueueCount: 3,
      services: ["General Practitioner", "Physiotherapy", "Optometry"],
      operatingHours: "08:00 - 18:00"
    },
    {
      id: "c4",
      name: "Rosebank Health Clinic",
      address: "50 Bath Ave, Rosebank, Johannesburg, 2196",
      lat: -26.1460,
      lng: 28.0371,
      baseWaitTimeMinutes: 15,
      currentQueueCount: 2,
      services: ["General Practitioner", "Travel Clinic", "Dermatology"],
      operatingHours: "09:00 - 17:00"
    }
  ];
  db.bookings = [
    {
      id: "b1",
      userId: "u1",
      clinicId: "c1",
      bookingTime: new Date(Date.now() - 3600000).toISOString(),
      appointmentTime: new Date(Date.now() + 7200000).toISOString(),
      status: "Confirmed",
      queueNumber: "T-101",
      estimatedWaitTime: 35
    }
  ];
};

module.exports = {
  db,
  resetDb
};
