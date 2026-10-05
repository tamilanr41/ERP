import { ERROR_CODES } from './codes.js';

const codeForStatus = (status) => {
  if (status === 400) return ERROR_CODES.BAD_REQUEST;
  if (status === 401) return ERROR_CODES.UNAUTHORIZED;
  if (status === 403) return ERROR_CODES.FORBIDDEN;
  if (status === 404) return ERROR_CODES.NOT_FOUND;
  if (status === 409) return ERROR_CODES.CONFLICT;
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  return ERROR_CODES.INTERNAL;
};

export class ApiError extends Error {
  constructor(statusCode, message, errors = undefined, code = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code || codeForStatus(statusCode);
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, message, undefined, ERROR_CODES.NOT_FOUND);
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Validation failed', errors = undefined) {
    super(400, message, errors, ERROR_CODES.VALIDATION_ERROR);
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request') {
    super(400, message, undefined, ERROR_CODES.BAD_REQUEST);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message, undefined, ERROR_CODES.UNAUTHORIZED);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message, undefined, ERROR_CODES.FORBIDDEN);
  }
}

export class ConflictError extends ApiError {
  /**
   * `details` is surfaced to the client so a UI can render the specific reason
   * (e.g. the exact list of unacknowledged alerts) rather than a generic toast.
   */
  constructor(message = 'Conflict', details = undefined) {
    super(409, message, details, ERROR_CODES.CONFLICT);
  }
}

export class RateLimitError extends ApiError {
  constructor(message = 'Too many requests') {
    super(429, message, undefined, ERROR_CODES.RATE_LIMITED);
  }
}

export class FeatureDisabledError extends ApiError {
  constructor(message = 'This feature is disabled for your organization') {
    super(403, message, undefined, ERROR_CODES.FEATURE_DISABLED);
  }
}

export class IdempotencyInProgressError extends ApiError {
  constructor(message = 'Request with the same Idempotency-Key is already being processed') {
    super(409, message, undefined, ERROR_CODES.IDEMPOTENCY_IN_PROGRESS);
  }
}