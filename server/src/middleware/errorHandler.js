import logger from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../utils/codes.js';

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
    body: req.body || undefined,
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