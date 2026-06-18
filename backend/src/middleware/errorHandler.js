/**
 * Global Express Error-Handling Middleware
 *
 * Design:
 * - Operational errors (err.isOperational === true): trusted errors like validation
 *   failures or 404s. We pass their status code and message directly to the client.
 * - Non-operational errors (unknown crashes, DB failures, programmer errors):
 *   we log the full error internally but return a generic masked 500 response
 *   so no stack traces or internal details are ever exposed to the public client.
 *
 * Usage: Mount as the LAST middleware in app.js.
 */

const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Always log the full error server-side for debugging
  console.error(`[Thuso Health Error] ${err.stack || err.message}`);

  // Determine whether this is a trusted operational error
  const isOperational = err.isOperational === true;
  const statusCode = isOperational && err.statusCode ? err.statusCode : 500;

  // For non-operational errors, mask internal details from the public response
  const clientMessage = isOperational ? err.message : 'Internal Server Error';

  return res.status(statusCode).json({
    success: false,
    message: clientMessage
  });
};

module.exports = { errorHandler };
