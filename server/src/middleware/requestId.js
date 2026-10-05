import { randomUUID } from 'crypto';

/**
 * requestId: assigns/reuses x-request-id, exposes it as req.id, prepares timing.
 * A finish listener in app.js logs request id with the call.
 */
export const requestId = (req, res, next) => {
  if (req.headers['x-request-id']) {
    req.id = String(req.headers['x-request-id']).slice(0, 64);
  } else {
    req.id = randomUUID();
  }
  res.setHeader('x-request-id', req.id);
  req._startedAt = Date.now();
  next();
};

export default requestId;