import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getToken } from './api';

const IPD_EVENTS = [
  'ipd:bed_updated',
  'ipd:bed_board_updated',
  'ipd:ward_occupancy',
  'ipd:admission_created',
  'ipd:admission_updated',
  'ipd:bed_allocated',
  'ipd:patient_transferred',
  'ipd:vital_recorded',
  'ipd:nursing_note_added',
  'ipd:doctor_visit_added',
  'ipd:order_created',
  'ipd:order_updated',
  'ipd:medication_prescribed',
  'ipd:medication_schedule',
  'ipd:mar_updated',
  'ipd:pharmacy_request',
  'ipd:pharmacy_issue',
  'ipd:lab_critical',
  'ipd:imaging_report',
  'ipd:discharge_readiness',
  'ipd:billing_alert',
  'ipd:advance_alert',
  'ipd:discharged',
];

/**
 * Subscribes to IPD realtime events and refreshes the affected react-query
 * caches, so the bed board, command centre, admission workspace, billing desk
 * and reports update without a page refresh.
 * Returns the live connection state so the UI never shows a fake "LIVE" badge.
 */
export function useIpdRealtime({ admissionId, enabled = true } = {}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!enabled) return undefined;
    const token = getToken();
    if (!token) return undefined;

    let socket;
    let closed = false;
    let retry;

    const refresh = (keys) => keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));

    const connect = () => {
      if (closed) return;
      // On Netlify the page origin is the static site, not the API, so
      // window.location.origin would connect to Netlify and never reach
      // Socket.IO. Prefer VITE_SOCKET_URL, else derive it from VITE_API_URL.
      const base = import.meta.env.VITE_SOCKET_URL
        || (import.meta.env.VITE_API_URL
          ? new URL(import.meta.env.VITE_API_URL).origin
          : window.location.origin);
      socket = import('socket.io-client').then(({ io }) => {
        if (closed) return null;
        const s = io(base, { auth: { token }, transports: ['websocket', 'polling'] });
        s.on('connect', () => setStatus('live'));
        s.on('disconnect', () => setStatus('reconnecting'));
        s.on('connect_error', () => setStatus('offline'));
        s.emit('join:ipd:board');
        if (admissionId) s.emit('join:ipd:admission', admissionId);

        s.on('ipd:bed_updated', () => refresh([['ipd-command-center'], ['ipd-beds'], ['ipd-beds-available'], ['ipd-ward-beds']]));
        s.on('ipd:bed_board_updated', () => refresh([['ipd-command-center'], ['ipd-beds'], ['ipd-beds-available'], ['ipd-admissions']]));
        s.on('ipd:patient_transferred', () => refresh([['ipd-command-center'], ['ipd-beds'], ['ipd-transfers'], ['ipd-admissions']]));
        s.on('ipd:bed_allocated', () => refresh([['ipd-command-center'], ['ipd-beds'], ['ipd-admissions'], ['ipd-waiting']]));
        s.on('ipd:admission_created', () => refresh([['ipd-admissions'], ['ipd-command-center']]));
        s.on('ipd:admission_updated', () => refresh([['ipd-admissions'], ['ipd-command-center'], ['ipd-readiness']]));
        s.on('ipd:discharged', () => refresh([['ipd-admissions'], ['ipd-command-center'], ['ipd-beds']]));
        s.on('ipd:discharge_readiness', () => refresh([['ipd-readiness'], ['ipd-settlement'], ['ipd-discharge-dashboard']]));
        s.on('ipd:advance_alert', (p) => {
          refresh([['ipd-advances'], ['ipd-settlement'], ['ipd-advance-alert']]);
          if (p?.level === 'CRITICAL') toast.error(`Advance alert — ${p.admissionNumber}: balance below critical threshold`);
          else if (p?.level === 'WARNING') toast.warning(`Advance alert — ${p.admissionNumber}: below configured threshold`);
        });
        s.on('ipd:billing_alert', () => refresh([['ipd-settlement'], ['ipd-advances'], ['ipd-bills']]));
        s.on('ipd:lab_critical', (p) => {
          refresh([['ipd-workspace'], ['ipd-settlement']]);
          toast.error(`CRITICAL lab result — ${p?.admissionNumber || 'IPD'}: ${p?.test || 'test'}`);
        });
        s.on('ipd:mar_updated', () => refresh([['ipd-workspace'], ['ipd-medication-charts']]));
        s.on('ipd:medication_schedule', () => refresh([['ipd-workspace']]));
        s.on('ipd:nursing_note_added', () => refresh([['ipd-workspace']]));
        s.on('ipd:doctor_visit_added', () => refresh([['ipd-workspace']]));
        s.on('ipd:order_created', () => refresh([['ipd-workspace'], ['ipd-orders']]));
        s.on('ipd:order_updated', () => refresh([['ipd-workspace'], ['ipd-orders']]));
        s.on('ipd:vital_recorded', () => refresh([['ipd-workspace'], ['ipd-vitals']]));
        s.on('ipd:pharmacy_issue', () => refresh([['ipd-workspace'], ['ipd-pharmacy']]));
        s.on('ipd:imaging_report', () => refresh([['ipd-workspace']]));
        return s;
      }).catch(() => null);

      socket.then((s) => {
        if (!s || closed) return;
        retry = setTimeout(connect, 15000);
      });
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.then((s) => s?.disconnect?.());
    };
  }, [qc, admissionId, enabled]);

  return { status, isLive: status === 'live' };
}

export default useIpdRealtime;
export { IPD_EVENTS };
