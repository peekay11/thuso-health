# Thuso Health - Smart Queue & Clinic Booking MVP

Thuso Health is a location-aware, offline-resilient healthcare booking application designed to reduce wait times at nearby health clinics by coordinating travel duration, wait times, and appointment scheduling.

## Features

- **Location-Based Distance & Travel Calculation**: Computes proximity to clinic using Haversine formula (supports full offline functionality) with structural hooks for Google Maps APIs.
- **Smart Queue Waiting Room**: Dynamically ranks clinics by "Total Time" (Travel Time + Waiting Room Queue wait time), helping patients decide which clinic has the shortest queue/travel compromise.
- **Offline Mode & Synchronization**: Bookings created while the server is offline are cached locally in the browser's `LocalStorage`. When the system detects the network is restored, it prompts the user to synchronize the bookings with the central Express database.
- **Unit Tests**: Full unit tests verifying API endpoints and queue logic.

---

## Directory Structure

```
thuso-health/
├── backend/                  # MVC Express API
│   ├── src/
│   │   ├── controllers/      # Route logic handlers
│   │   ├── models/           # DB schema mock and queries
│   │   ├── routes/           # Endpoint mappings
│   │   ├── services/         # Queue wait time algorithms & maps service
│   │   ├── app.js            # Express app configuration
│   │   └── server.js         # Port listener launcher
│   ├── tests/                # Jest + Supertest suite
│   ├── package.json
│   └── package-lock.json
│
└── frontend/                 # Client UI (works offline)
    ├── index.html            # Main UI Layout
    ├── style.css             # Glassmorphic premium CSS styling
    ├── app.js                # State management and offline sync engine
    ├── package.json          # Light http-server dev package
    └── package-lock.json
```

---

## Running the Application

### Prerequisite

- [Node.js](https://nodejs.org/) (v16+ recommended)

### Step 1: Start the Backend Server

1. Open a terminal and navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Run the development script:
   ```bash
   npm run dev
   ```
   The backend runs on `http://localhost:5000`.

### Step 2: Start the Frontend Application

1. Open a new terminal and navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Start the static file server:
   ```bash
   npm run dev
   ```
   The frontend runs on `http://localhost:3000`. Open this address in your web browser.

---

## Running the Unit Tests

The backend includes a comprehensive Jest unit test suite.

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Run the test command:
   ```bash
   npm run test
   ```
