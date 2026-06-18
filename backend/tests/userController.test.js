// tests/controllers/userController.test.js
const request = require('supertest');
const app = require('../src/app'); // Path to your Express app
const UserService = require('../src/services/userService');

// Mock the UserService to isolate the Controller layer
jest.mock('../src/services/userService');

describe('UserController Tests', () => {
    let mockUser;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUser = {
            id: 'user-123',
            name: 'Thuso Khumalo',
            email: 'thuso@health.co.za',
            role: 'patient'
        };
    });

    describe('POST /api/users/register', () => {
        it('should register a new user successfully and return 201', async () => {
            UserService.registerUser.mockResolvedValue(mockUser);

            const res = await request(app)
                .post('/api/users/register')
                .send({
                    name: 'Thuso Khumalo',
                    email: 'thuso@health.co.za',
                    password: 'SecurePassword123!'
                });

            expect(res.statusCode).toBe(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.email).toBe('thuso@health.co.za');
            expect(UserService.registerUser).toHaveBeenCalledTimes(1);
        });

        it('should return 400 if validation fails (missing email)', async () => {
            const res = await request(app)
                .post('/api/users/register')
                .send({
                    name: 'Thuso Khumalo',
                    password: 'SecurePassword123!'
                });

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('POST /api/users/login', () => {
        it('should authenticate user and return a JWT token', async () => {
            UserService.loginUser.mockResolvedValue({
                user: mockUser,
                token: 'mocked-jwt-token'
            });

            const res = await request(app)
                .post('/api/users/login')
                .send({
                    email: 'thuso@health.co.za',
                    password: 'SecurePassword123!'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user.email).toBe('thuso@health.co.za');
        });

        it('should return 401 for invalid credentials', async () => {
            UserService.loginUser.mockRejectedValue(new Error('Invalid email or password'));

            const res = await request(app)
                .post('/api/users/login')
                .send({
                    email: 'thuso@health.co.za',
                    password: 'wrongpassword'
                });

            expect(res.statusCode).toBe(401);
        });
    });

    describe('GET /api/users/profile', () => {
        it('should fetch user profile if authenticated', async () => {
            UserService.getUserById.mockResolvedValue(mockUser);

            const res = await request(app)
                .get('/api/users/profile')
                .set('Authorization', 'Bearer mocked-jwt-token'); // Simulating auth middleware

            expect(res.statusCode).toBe(200);
            expect(res.body.name).toBe('Thuso Khumalo');
        });
    });
});