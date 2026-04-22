// backend/src/middleware/errorHandler.js

/**
 * Centralized error handling middleware
 * Should be registered LAST in app.use stack
 * 
 * Usage:
 *   app.use(errorHandler());
 */
export function errorHandler() {
  return (err, req, res, next) => {
    console.error('❌ Error caught by handler:', err);

    // Log stack trace in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('Stack:', err.stack);
    }

    // Default error structure
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal server error";
    let errorCode = err.errorCode || "INTERNAL_ERROR";

    // Don't expose internal details in production
    if (process.env.NODE_ENV === 'production') {
      message = statusCode === 500 ? "Internal server error" : message;
    }

    // Response
    res.status(statusCode).json({
      error: errorCode,
      message: message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
  };
}

/**
 * Custom error class for known errors
 * 
 * Usage:
 *   throw new AppError(400, "Invalid input", "VALIDATION_ERROR")
 */
export class AppError extends Error {
  constructor(statusCode = 500, message = "Internal error", errorCode = "INTERNAL_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.name = 'AppError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message, fields = {}) {
    super(400, message, "VALIDATION_ERROR");
    this.fields = fields;
  }
}

/**
 * Unauthorized error
 */
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

/**
 * Forbidden error
 */
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, message, "NOT_FOUND");
  }
}
