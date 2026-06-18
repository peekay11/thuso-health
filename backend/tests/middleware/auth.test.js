const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { authMiddleware, roleCheck } = require('../../src/middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

describe('Auth Middleware & Role Check Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Protected route for testing authMiddleware
    app.get('/test-auth', authMiddleware, (req, res) => {
      res.status(200).json({ success: true, user: req.user });
    });

    // Protected route for testing roleCheck (requires 'practitioner')
    app.get('/test-role-practitioner', authMiddleware, roleCheck(['practitioner']), (req, res) => {
      res.status(200).json({ success: true, user: req.user });
    });

    // Protected route for testing roleCheck multiple roles (requires 'practitioner' or 'admin')
    app.get('/test-role-multi', authMiddleware, roleCheck(['practitioner', 'admin']), (req, res) => {
      res.status(200).json({ success: true, user: req.user });
    });
  });

  describe('authMiddleware', () => {
    it('should call next() and attach user if a valid JWT token is provided', async () => {
      const payload = { id: 'u1', email: 'paseka@thuso.health', role: 'patient' };
      const token = jwt.sign(payload, JWT_SECRET);

      const response = await request(app)
        .get('/test-auth')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toMatchObject(payload);
    });

    it('should return a 401 status code if no token is provided', async () => {
      const response = await request(app)
        .get('/test-auth');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should return a 401 status code if no Bearer prefix is used', async () => {
      const token = jwt.sign({ id: 'u1' }, JWT_SECRET);
      const response = await request(app)
        .get('/test-auth')
        .set('Authorization', `${token}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should return a 401 status code if an invalid or expired token is provided', async () => {
      const response = await request(app)
        .get('/test-auth')
        .set('Authorization', 'Bearer invalidtoken123');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('roleCheck', () => {
    it('should call next() if the authenticated user role matches the allowed role', async () => {
      const payload = { id: 'u2', email: 'drdube@thuso.health', role: 'practitioner' };
      const token = jwt.sign(payload, JWT_SECRET);

      const response = await request(app)
        .get('/test-role-practitioner')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should call next() if the authenticated user role matches one of the multiple allowed roles', async () => {
      const payload = { id: 'u3', email: 'admin@thuso.health', role: 'admin' };
      const token = jwt.sign(payload, JWT_SECRET);

      const response = await request(app)
        .get('/test-role-multi')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return a 403 status code if the user role does not match the allowed role', async () => {
      const payload = { id: 'u1', email: 'paseka@thuso.health', role: 'patient' };
      const token = jwt.sign(payload, JWT_SECRET);

      const response = await request(app)
        .get('/test-role-practitioner')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });
  });
});
