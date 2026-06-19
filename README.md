# Thuso Health

Thuso Health is a simple healthcare booking system that helps patients find the nearest clinic, reserve a slot, and manage visits while also giving clinic staff a queue dashboard.

The app is designed to work both online and offline, so users can still book or view information even when the network is unstable.

---

## What this project does

- Helps patients compare clinics using travel time, waiting time, and total time.
- Shows clinic congestion levels so users can understand how busy a clinic is.
- Displays the power status of each clinic (grid power or backup power).
- Lets patients book appointments and view their booking history.
- Gives healthcare staff a dashboard to check in, complete, or cancel bookings.
- Supports offline behavior with local storage and sync when the connection returns.

---

## Main features
 
- Clinic search and sorting by distance, wait time, or total time
- Congestion and queue load indicators for each clinic
- Power station / power availability status for each clinic
- Travel time estimates based on location and clinic distance
- Patient login and registration
- Booking modal with appointment timing advice
- Active booking and booking history views
- Healthcare provider dashboard
- Offline queue syncing
- Basic health passport / consent workflow

---

## Tech stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Testing:** Jest, Supertest
- **Offline support:** Browser local storage

---

## Project structure

```text
thuso-health/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── app.js
│   │   └── server.js
│   └── tests/
└── frontend/
    ├── index.html
    ├── healthcare.html
    ├── app.js
    └── style.css
```

---

## Getting started

### 1. Install Node.js

Make sure you have Node.js installed.

Recommended version: 16 or newer

### 2. Install dependencies

Open two terminals:

#### Backend
```bash
cd backend
npm install
```

#### Frontend
```bash
cd frontend
npm install
```

---

## Running the app

### Start the backend

From the backend folder:

```bash
npm run dev
```

The API will run at:

```text
http://localhost:5000
```

### Start the frontend

From the frontend folder:

```bash
npm run dev
```

The UI will run at:

```text
http://localhost:3000
```

---

## Demo login options

You can use these sample accounts during development:

### Patient
- Email: `paseka@thuso.health`
- Password: `password123`

### Healthcare provider
- Email: `sarah@thuso.health`
- Password: `password123`

---

## Running tests

From the backend folder:

```bash
npm run test
```

This runs the backend test suite for routes, controllers, services, and middleware.

---

## How the system works

1. A patient opens the frontend and chooses a clinic.
2. The app calculates travel time, estimated wait time, and total time.
3. The patient books a slot and gets a queue number.
4. The booking is saved locally if the network is unavailable.
5. When the connection returns, the app syncs pending bookings and updates.
6. Healthcare staff can log in to the provider portal and manage the queue.

---

## Notes about offline behavior

If the app loses internet access:

- bookings may be saved locally
- the UI continues to work using stored data
- the sync button will appear when the connection is restored

---

## Contributing

If you want to improve the project:

1. Create a new branch
2. Make your changes
3. Test the backend
4. Open a pull request

