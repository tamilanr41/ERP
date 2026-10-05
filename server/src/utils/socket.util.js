import { Server as SocketServer } from 'socket.io';
import logger from '../config/logger.js';
import { verifyAccessToken } from '../middleware/auth.js';

let io = null;
const ACTIVE_ROOMS = new Set();

/**
 * initSocketServer — the single Socket.IO instance for the ERP.
 * Attach to the raw http.Server (NOT express app) so the client can reuse the
 * same port 5000. Clients must prove identity with a Bearer access token in the
 * handshake auth; without it the connection is rejected.
 */
export const initSocketServer = (httpServer, options = {}) => {
  if (io) return io_andServer(httpServer); // idempotent

  try {
    io = new SocketServer(httpServer, {
      cors: {
        origin: options.origin || ['http://localhost:5173', 'http://localhost:3000'],
        credentials: true,
      },
      path: options.path || '/socket.io',
      pingInterval: 25000,
      pingTimeout: 20000,
    });

    io.use((socket, next) => {
      const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
      if (!token) return next(new Error('Authentication required'));
      try {
        const payload = verifyAccessToken(token);
        socket.userId = payload.id || payload.sub;
        socket.roleCode = payload.roleCode;
        socket.hospitalId = payload.hospitalId;
        socket.branchId = payload.branchId;
        return next();
      } catch (err) {
        return next(new Error('Invalid or expired token'));
      }
    });

    io.on('connection', (socket) => {
      logger.info(`[realtime] client connected: ${socket.id} (user ${socket.userId})`);

      socket.on('visit:subscribe', (visitId) => {
        if (!visitId) return;
        const room = `visit:${visitId}`;
        socket.join(room);
        ACTIVE_ROOMS.add(room);
        logger.info(`[realtime] ${socket.id} subscribed to ${room}`);
      });

      socket.on('visit:unsubscribe', (visitId) => {
        if (!visitId) return;
        socket.leave(`visit:${visitId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`[realtime] client disconnected: ${socket.id}`);
      });
    });

    logger.info('Socket.IO initialised on http server');
  } catch (err) {
    logger.error('Socket.IO init failed — realtime disabled', { error: err.message });
    io = null;
  }
  return io;
};

export const getIO = () => io;

export const isRealtimeEnabled = () => !!io;

/**
 * emitToVisit — push a visit-scoped event to everyone in visit:&lt;visitId&gt;.
 * Used after OPD workspace mutations so the open workspace tab updates live.
 */
export const emitToVisit = (visitId, event, payload = {}) => {
  if (!io || !visitId) return false;
  const room = `visit:${visitId}`;
  const envelope = {
    event,
    visitId: String(visitId),
    payload,
    at: new Date().toISOString(),
  };
  io.to(room).emit(event, envelope);
  return true;
};

export default getIO;
