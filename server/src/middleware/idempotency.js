import { createHash } from 'crypto';
import IdempotencyRecord from '../models/IdempotencyRecord.model.js';
import { IdempotencyInProgressError } from '../utils/ApiError.js';

const TTL_MS = 24 * 60 * 60 * 1000;
const STALE_MS = 10 * 1000;
const MAX_STORED_BYTES = 256 * 1024;

const hashRequest = (req) => {
  const body = req.body === undefined ? '' : JSON.stringify(req.body);
  return createHash('sha256').update(`${req.method}:${req.originalUrl}:${body}`).digest('hex').slice(0, 64);
};

/**
 * idempotency: replay-safe POST/PATCH/DELETE support via Idempotency-Key header.
 * - No header  -> pass-through (no behavioral change for existing clients).
 * - New key    -> run handler, store status+body, return response.
 * - Stored key -> replay the stored response verbatim (same payload).
 * - In-flight  -> 409 IDEMPOTENCY_IN_PROGRESS (do not double-execute).
 *
 * Apply to money (billing/payments/refunds), stock (sale/purchase), and
 * admission/movement endpoints. Guarded by ENABLE_IDEMPOTENCY feature flag.
 */
export const idempotency = async (req, res, next) => {
  const key = req.headers['idempotency-key'];
  const method = req.method.toUpperCase();
  const isWrite = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
  if (!key || !isWrite || !req.user?.id) return next();

  const cleanKey = String(key).slice(0, 128);

  const existing = await IdempotencyRecord.findOne({ userId: req.user.id, key: cleanKey });
  if (existing) {
    if (existing.status === 'DONE' && existing.statusCode && existing.responseBody !== undefined) {
      res.status(existing.statusCode);
      res.setHeader('x-idempotent-replay', 'true');
      return res.json(existing.responseBody);
    }
    // Stale in-flight claim (crashed/network-cut request): clear and allow retry.
    const age = Date.now() - new Date(existing.createdAt).getTime();
    if (age > STALE_MS) {
      await existing.deleteOne();
    } else {
      throw new IdempotencyInProgressError();
    }
  }

  const expiresAt = new Date(Date.now() + TTL_MS);
  let record;
  try {
    record = await IdempotencyRecord.create({
      userId: req.user.id,
      key: cleanKey,
      method,
      path: req.originalUrl,
      requestHash: hashRequest(req),
      expiresAt,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Concurrent same-key request lost the race: replay existing outcome.
      const winner = await IdempotencyRecord.findOne({ userId: req.user.id, key: cleanKey });
      if (winner && winner.status === 'DONE') {
        res.status(winner.statusCode || 500);
        res.setHeader('x-idempotent-replay', 'true');
        return res.json(winner.responseBody || { success: false });
      }
      throw new IdempotencyInProgressError();
    }
    throw err;
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    originalJson(body);
    const stored = JSON.stringify(body);
    const safeBody = stored && stored.length > MAX_STORED_BYTES ? { success: body?.success, message: body?.message, code: 'TRUNCATED' } : body;
    record.status = 'DONE';
    record.statusCode = res.statusCode;
    record.responseBody = safeBody;
    IdempotencyRecord.updateOne(
      { _id: record._id },
      { $set: { status: 'DONE', statusCode: res.statusCode, responseBody: safeBody, requestHash: hashRequest(req) } },
    ).catch(() => {});
    return res;
  };

  res.on('finish', () => {
    if (!record || res.getHeader('x-idempotent-replay') === 'true') return;
    if (res.statusCode >= 400 || record.status === 'DONE') return;
    // Handler errored without res.json wrapper completing -> delete in-flight claim so retries can run.
    IdempotencyRecord.deleteOne({ _id: record._id }).catch(() => {});
  });

  return next();
};

export default idempotency;