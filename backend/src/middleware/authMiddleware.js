const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

/**
 * Authentication Middleware
 * Validates JWT Bearer tokens from the Authorization header.
 */
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is missing' });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization format must be Bearer <token>' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token is missing' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token', details: error.message });
  }
};

/**
 * Authorization Middleware Factory
 * Checks if the authenticated user has one of the allowed roles.
 * @param {string[]} allowedRoles - List of roles permitted to access the resource
 */
const roleCheck = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Access forbidden: user role not found' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access forbidden: required role is one of [${allowedRoles.join(', ')}]` });
    }

    next();
  };
};

module.exports = {
  authMiddleware,
  roleCheck
};
