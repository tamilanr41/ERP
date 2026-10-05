import { emitIpd, IPD_SOCKET_EVENTS } from '../utils/socket.io.server.js';

/**
 * Dialysis realtime notifications ride on the IPD socket channel so the command
 * centre, slot board, machine board and patient 360 all refresh from one
 * connection. Realtime must never break a clinical action.
 */
export const emitDialysis = (event, payload = {}) => {
  try {
    emitIpd(IPD_SOCKET_EVENTS.BED_BOARD_UPDATED, { reason: `dialysis:${event}`, ...payload });
  } catch {
    // deliberately silent
  }
};

export default emitDialysis;
