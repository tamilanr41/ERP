import { validationResult } from 'express-validator';
import { ValidationError } from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * validate - runs express-validator chain and returns formatted errors
 */
export const validate = (validations) => asyncHandler(async (req, res, next) => {
  for (const v of validations) {
    const result = await v.run(req);
    if (result.errors.length) break;
  }
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const formatted = {};
  for (const error of errors.array()) {
    const field = error.path || error.param || 'field';
    if (!formatted[field]) formatted[field] = [];
    formatted[field].push(error.msg);
  }

  throw new ValidationError('Validation failed', formatted);
});

export default validate;