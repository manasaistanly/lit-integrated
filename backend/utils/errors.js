class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {string} type - Error type (default: 'GENERAL')
   */
  constructor(message, statusCode = 500, type = 'GENERAL') {
    super(message);
    this.statusCode = statusCode;
    this.type = type;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Standardized Error Types
 */
const ErrorTypes = {
  VALIDATION: 'VALIDATION',
  AUTHENTICATION: 'AUTHENTICATION',
  AUTHORIZATION: 'AUTHORIZATION',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE: 'DUPLICATE',
  PAYMENT: 'PAYMENT',
  GENERAL: 'GENERAL'
};

module.exports = {
  AppError,
  ErrorTypes
};