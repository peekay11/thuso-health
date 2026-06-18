const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api.routes');
const bookingRoutes = require('./routes/bookingRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Dedicated booking routes (must come before generic apiRoutes)
app.use('/api/bookings', bookingRoutes);

// API Routes
app.use('/api', apiRoutes);

// Root route for server verification
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to the Thuso Health API Server",
    version: "1.0.0",
    status: "Healthy"
  });
});

// 404 Route handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: "Resource not found"
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message
  });
});

module.exports = app;
