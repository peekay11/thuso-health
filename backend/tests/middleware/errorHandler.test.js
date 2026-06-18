const request = require('supertest');
const express = require('express');

// We build a minimal isolated app for each test group so we can
// mount dummy routes that throw controlled errors.
const { errorHandler } = require('../../src/middleware/errorHandler');

function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Operational error route — simulates a known validation or business-logic error
  app.get('/test-operational', (req, res, next) => {
    const err = new Error('Resource not found');
    err.statusCode = 404;
    err.isOperational = true;
    next(err);
  });

  // Validation error route — simulates a 400 bad-input error
  app.get('/test-validation', (req, res, next) => {
    const err = new Error('Validation failed: email is required');
    err.statusCode = 400;
    err.isOperational = true;
    next(err);
  });

  // Unhandled / programmer error route — simulates a raw DB crash or unexpected throw
  app.get('/test-crash', (req, res, next) => {
    const err = new Error('MongooseError: connection pool exhausted — internal details');
    // No statusCode set — should be treated as a 500
    next(err);
  });

  // Route that throws synchronously (not passed to next)
  app.get('/test-sync-throw', (req, res, next) => {
    throw new Error('Unhandled synchronous crash with sensitive trace info');
  });

  app.use(errorHandler);
  return app;
}

describe('Global Error Handler Middleware', () => {
  let app;

  beforeAll(() => {
    app = buildTestApp();
  });

  describe('Operational / Validation Errors', () => {
    it('should return the specific 404 status code and clear message for operational errors', async () => {
      const res = await request(app).get('/test-operational');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Resource not found');
      // Must NOT leak stack trace
      expect(res.body).not.toHaveProperty('stack');
    });

    it('should return the specific 400 status code and clear message for validation errors', async () => {
      const res = await request(app).get('/test-validation');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed: email is required');
      expect(res.body).not.toHaveProperty('stack');
    });
  });

  describe('Unhandled / Internal System Errors', () => {
    it('should mask internal DB crash details and return a clean 500 without leaking internals', async () => {
      const res = await request(app).get('/test-crash');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      // Must NOT expose raw DB error message to the client
      expect(res.body.message).not.toMatch(/Mongoose/i);
      expect(res.body.message).not.toMatch(/connection pool/i);
      // Should return a generic safe message instead
      expect(res.body.message).toBe('Internal Server Error');
      expect(res.body).not.toHaveProperty('stack');
    });

    it('should catch synchronous throws and return a masked 500 response', async () => {
      const res = await request(app).get('/test-sync-throw');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Internal Server Error');
      expect(res.body).not.toHaveProperty('stack');
    });
  });
});
