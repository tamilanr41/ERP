import { Server as SocketIOServer } from 'socket.io';
import logger from '../config/logger.js';
import { verifyAccessToken } from '../middleware/auth.js';

let io = null;

export const VISIT_SOCKET_EVENTS = {
  VITALS_RECORDED: 'visits:vitals_recorded',
  DIAGNOSIS_ADDED: 'visits:diagnosis_added',
  DIAGNOSIS_UPDATED: 'visits:diagnosis_updated',
  ORDER_CREATED: 'visits:order_created',
  ORDER_STATUS: 'visits:order_status',
  NOTE_CREATED: 'visits:note_created',
  PRESCRIPTION_CREATED: 'visits:prescription_created',
  PRESCRIPTION_FINALIZED: 'visits:prescription_finalized',
  FOLLOWUP_CREATED: 'visits:followup_created',
  FOLLOWUP_COMPLETED: 'visits:followup_completed',
  VISIT_UPDATED: 'visits:visit_updated',
  VISIT_CLOSED: 'visits:visit_closed',
  BILL_CREATED: 'visits:bill_created',
  PAYMENT_RECEIVED: 'visits:payment_received',
};

export const initSocketServer = (httpServer, { corsOrigin } = {}) => {
  if (io) {
    logger.warn('Socket.io already initialised; returning existing instance');
    return io;
  }

  io = new SocketIOServer(httpServer, {
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
    const roomPrefix = 'visit:';

    socket.on('join:visit', (visitId) => {
      if (!visitId) return;
      socket.join(`${roomPrefix}${visitId}`);
      logger.info(`Socket ${socket.id} joined visit room ${visitId}`);
    });

    socket.on('leave:visit', (visitId) => {
      if (!visitId) return;
      socket.leave(`${roomPrefix}${visitId}`);
    });

    // IPD rooms: the live bed board and a single admission's workspace
    socket.on('join:ipd:board', () => {
      socket.join('ipd:board');
    });
    socket.on('join:ipd:admission', (admissionId) => {
      if (!admissionId) return;
      socket.join(`ipd:admission:${admissionId}`);
    });
    socket.on('leave:ipd:admission', (admissionId) => {
      if (!admissionId) return;
      socket.leave(`ipd:admission:${admissionId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  logger.info('Socket.io server initialised');
  return io;
};

export const getIO = () => io;

export const emitToVisit = (visitId, event, payload) => {
  if (!io || !visitId) return;
  const visitRoom = `visit:${visitId}`;
  const enriched = {
    event,
    visitId,
    payload,
    timestamp: new Date().toISOString(),
  };
  io.to(visitRoom).emit(event, enriched);
};

export const broadcastEvent = (event, payload) => {
  if (!io) return;
  io.emit(event, payload);
};

export const IPD_SOCKET_EVENTS = {
  BED_UPDATED: 'ipd:bed_updated',
  BED_BOARD_UPDATED: 'ipd:bed_board_updated',
  WARD_OCCUPANCY: 'ipd:ward_occupancy',
  ADMISSION_CREATED: 'ipd:admission_created',
  ADMISSION_UPDATED: 'ipd:admission_updated',
  BED_ALLOCATED: 'ipd:bed_allocated',
  PATIENT_TRANSFERRED: 'ipd:patient_transferred',
  VITAL_RECORDED: 'ipd:vital_recorded',
  NURSING_NOTE_ADDED: 'ipd:nursing_note_added',
  DOCTOR_VISIT_ADDED: 'ipd:doctor_visit_added',
  ORDER_CREATED: 'ipd:order_created',
  ORDER_UPDATED: 'ipd:order_updated',
  MEDICATION_PRESCRIBED: 'ipd:medication_prescribed',
  MEDICATION_SCHEDULE: 'ipd:medication_schedule',
  MAR_UPDATED: 'ipd:mar_updated',
  PHARMACY_REQUEST: 'ipd:pharmacy_request',
  PHARMACY_ISSUE: 'ipd:pharmacy_issue',
  LAB_CRITICAL: 'ipd:lab_critical',
  IMAGING_REPORT: 'ipd:imaging_report',
  DISCHARGE_READINESS: 'ipd:discharge_readiness',
  BILLING_ALERT: 'ipd:billing_alert',
  ADVANCE_ALERT: 'ipd:advance_alert',
  DISCHARGED: 'ipd:discharged',
};

/**
 * Emit an IPD event to the ward board + admission rooms + the global board room.
 * Never throws — a realtime failure must not break the clinical transaction.
 */
export const emitIpd = (event, payload = {}, admissionId = null) => {
  try {
    if (!io) return false;
    const enriched = { event, ...payload, timestamp: new Date().toISOString() };
    io.to('ipd:board').emit(event, enriched);
    if (admissionId) io.to(`ipd:admission:${admissionId}`).emit(event, enriched);
    return true;
  } catch {
    return false;
  }
};
