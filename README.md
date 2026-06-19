# Thuso Health

Thuso Health is a simple healthcare system that helps patients find the nearest clinic and manage visits while also giving clinic staff a queue dashboard.

The app is designed to work both online and offline, so users can still book or view information even when the network is unstable.

---

## Problem statement

Many patients struggle to choose the right clinic because they do not know which one is:

- closest to them
- least crowded
- most reliable in terms of power and operating conditions
- quickest to reach given travel time and queue delays

This often leads to wasted time, long waits, and poor decision-making when people need urgent care.

## What this project is solving .. solution statement

Thuso Health helps patients make faster and smarter clinic decisions by combining:

- travel time estimates
- queue congestion information
- clinic power availability
- booking support for both online and offline situations

The goal is to reduce uncertainty and help people reach a clinic that is both practical and efficient.

---

## Implementation logic

The application works in the following way:

1. The frontend loads clinic data and the user's selected location.
2. The system calculates the distance between the user and each clinic.
3. It estimates travel time and combines that with current queue conditions.
4. It shows clinic congestion, power status, and total expected time.
5. The patient can choose a clinic, reserve a booking, and view their active ticket.
6. If the network is unavailable, the booking is saved locally and synced later.
7. Clinic staff can log in to manage bookings, check patients in, and update queue status.

This logic helps the app present a clear recommendation for which clinic is the best option at that moment.

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

