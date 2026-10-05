import logger from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../utils/codes.js';

/**
 * Request bodies are attached to error logs to make failures diagnosable, but a
 * login or password-reset body must never reach a log file or stdout in clear
 * text. Matching is done on a lower-cased key, and on the substring "password"
 * so that currentPassword / newPassword / passwordHash are caught too.
 */
const REDACTED = '***';
const isSensitive = (key) => {
  const k = String(key).toLowerCase();
  return k.includes('password') || k.includes('token') || k.includes('secret') || k === 'authorization' || k === 'pin' || k === 'otp';
};

export const redactSensitive = (value, depth = 0) => {
  if (depth > 4 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = isSensitive(key) ? REDACTED : redactSensitive(val, depth + 1);
  }
  return out;
};

export const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: ERROR_CODES.NOT_FOUND,
    requestId: req.id,
  });
};

export const errorHandler = (err, req, res, _next) => {
  let error = err;

  if (error.name === 'CastError') {
    error = new ApiError(400, `Invalid ${error.path}: ${error.value}`, undefined, ERROR_CODES.VALIDATION_ERROR);
  }
  if (error.name === 'ValidationError') {
    const errors = {};
    for (const [path, e] of Object.entries(error.errors || {})) {
      errors[path] = e.message;
    }
    error = new ApiError(400, 'Validation failed', errors, ERROR_CODES.VALIDATION_ERROR);
  }
  if (error.code === 11000) {
    const fields = Object.keys(error.keyValue || {}).join(', ');
    error = new ApiError(409, `Duplicate value for: ${fields}`, undefined, ERROR_CODES.CONFLICT);
  }
  if (error.name === 'TokenExpiredError') error = new ApiError(401, 'Token expired', undefined, ERROR_CODES.UNAUTHORIZED);
  if (error.name === 'JsonWebTokenError') error = new ApiError(401, 'Invalid token', undefined, ERROR_CODES.UNAUTHORIZED);
  if (error.name === 'MulterError') error = new ApiError(400, `Upload error: ${error.message}`, undefined, ERROR_CODES.VALIDATION_ERROR);
  if (error.type === 'entity.parse.failed') error = new ApiError(400, 'Invalid JSON body', undefined, ERROR_CODES.VALIDATION_ERROR);
  if (error.name === 'MongoServerError' && error.code === 112) {
    error = new ApiError(409, 'Concurrent modification, please retry', undefined, ERROR_CODES.CONFLICT);
  }

  const statusCode = error.statusCode || 500;
  const code = error.code || (statusCode >= 500 ? ERROR_CODES.INTERNAL : ERROR_CODES.BAD_REQUEST);

  logger.error(`${req.method} ${req.originalUrl} -> ${statusCode}`, {
    requestId: req.id,
    message: error.message,
    code,
    stack: statusCode >= 500 ? error.stack : undefined,
    body: req.body ? redactSensitive(req.body) : undefined,
  });

  if (!error.isOperational && !statusCode) {
    error.message = 'Internal server error';
  }

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error',
    code,
    errors: error.errors || undefined,
    requestId: req.id,
  });
};

export default errorHandler;