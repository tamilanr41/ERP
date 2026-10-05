import { Server as SocketServer } from 'socket.io';
import logger from '../config/logger.js';
import { verifyAccessToken } from './auth.js';

let io = null;

/**
 * realtime — Socket.IO lifecycle + emit helpers backed by visit-scoped rooms.
 * Some rooms follow a strict naming convention so the OPD workspace can react
 * to live clinical events (vit sign, order status, lab/rad result, rx status,
 * follow-up, billing) without polling.
 */
export const initRealtime = (httpServer, { corsOrigin } = {}) => {
  if (io) return io;

  io = new SocketServer(httpServer, {
    cors: {
      origin: corsOrigin || ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use((socket, next) => {
    const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
    if (!token) return next(new Error('Authentication token required'));
    try {
      const decoded = verifyAccessToken(token);
      socket.userId = decoded.sub || decoded.id;
      socket.user = decoded;
      return next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`[realtime] client connected: ${socket.id}`);

    socket.on('visit:join', (visitId) => {
      if (!visitId) return;
      socket.join(`visit:${visitId}`);
      logger.info(`[realtime] socket ${socket.id} joined visit:${visitId}`);
    });

    socket.on('visit:leave', (visitId) => {
      if (!visitId) return;
      socket.leave(`visit:${visitId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`[realtime] client disconnected: ${socket.id}`);
    });
  });

  logger.info('Socket.IO server initialised');
  return io;
};

export const getRealtime = () => io;

export const emitVisitEvent = (visitId, event, payload = {}) => {
  if (!io || !visitId) return;
  const visitRoom = `visit:${visitId}`;
  const envelope = {
    event,
    visitId: visitId.toString ? visitId.toString() : visitId,
    payload,
    serverTime: new Date().toISOString(),
  };
  io.to(visitRoom).emit(event, envelope);
  logger.debug(`[realtime] emitted ${event} to ${visitRoom}`);
};

export const emitBroadcast = (event, payload = {}) => {
  if (!io) return;
  const envelope = {
    event,
    payload,
    serverTime: new Date().toISOString(),
  };
  io.emit(event, envelope);
};
