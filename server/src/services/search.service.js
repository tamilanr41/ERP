import Patient from '../models/Patient.model.js';
import Doctor from '../models/Doctor.model.js';
import User from '../models/User.model.js';
import Medicine from '../models/Medicine.model.js';
import Appointment from '../models/Appointment.model.js';
import Bill from '../models/Bill.model.js';
import IpdAdmission from '../models/IpdAdmission.model.js';
import { Bed } from '../models/Bed.model.js';
import { regex } from '../utils/helpers.js';

const LIMIT_MAX = 10;

/* Permission gating per entity type: palette shows only what the user may see. */
const TYPE_PERMS = {
  patients: ['PATIENT_VIEW'],
  doctors: ['PATIENT_VIEW', 'APPOINTMENT_VIEW', 'OPD_VIEW', 'IPD_VIEW'],
  users: ['USER_VIEW'],
  medicines: ['PHARMACY_VIEW', 'PRESCRIPTION_CREATE', 'INVENTORY_VIEW'],
  appointments: ['APPOINTMENT_VIEW'],
  bills: ['BILLING_VIEW', 'PAYMENT_VIEW', 'FINANCE_VIEW'],
  admissions: ['IPD_VIEW'],
  beds: ['BED_VIEW', 'IPD_VIEW'],
};

const ALL_TYPES = Object.keys(TYPE_PERMS);

const can = (actor, type) => {
  if (actor?.roleCode === 'SUPER_ADMIN' || (actor?.permissions || []).includes('*')) return true;
  return TYPE_PERMS[type].some((p) => actor?.permissions?.includes(p));
};

const textMatch = (q) => ({ $text: { $search: q } });

export const searchAll = async ({ q, types, actor, limit = 6 }) => {
  const query = String(q || '').trim();
  const asked = Array.isArray(types)
    ? types.filter((t) => ALL_TYPES.includes(t))
    : types === '*'
      ? ALL_TYPES
      : ALL_TYPES.filter((t) => types === t);
  const wanted = new Set(asked.length ? asked : ALL_TYPES);
  const per = Math.min(Math.max(parseInt(limit, 10) || 6, 1), LIMIT_MAX);
  const out = { query, results: {} };

  if (!query) return out;

  const grant = (t) => wanted.has(t) && can(actor, t);

  /* patients: weighted text index + filters */
  if (grant('patients')) {
    const filter = { status: { $ne: 'MERGED' }, deletedAt: null };
    const docs = await Patient.find(
      query.length >= 3 ? { ...filter, ...textMatch(query) } : { ...filter, $or: [
        { uhid: regex(query) }, { mobile: regex(query) }, { firstName: regex(query) }, { lastName: regex(query) },
        { registrationNumber: regex(query) }, { 'idProof.number': regex(query) },
      ] },
    )
      .select('uhid registrationNumber firstName lastName gender age dateOfBirth mobile')
      .limit(per);
    out.results.patients = docs.map((p) => ({
      type: 'patient',
      id: p._id,
      label: p.fullName?.() || [p.firstName, p.lastName].filter(Boolean).join(' '),
      subtitle: `${p.uhid} · ${p.gender}${p.mobile ? ` · ${p.mobile}` : ''}`,
      meta: { uhid: p.uhid, gender: p.gender, age: p.age, mobile: p.mobile },
      ref: `/patients/${p._id}`,
    }));
  }

  /* doctors: text index over name/specialization/doctorCode */
  if (grant('doctors')) {
    const docs = await Doctor.find(query.length >= 3 ? textMatch(query) : { $or: [{ name: regex(query) }, { doctorCode: regex(query) }, { specialization: regex(query) }] })
      .select('name doctorCode specialization departmentId consultationFee')
      .limit(per);
    out.results.doctors = docs.map((d) => ({
      type: 'doctor',
      id: d._id,
      label: `${d.name}${d.specialization ? ` · ${d.specialization}` : ''}`,
      subtitle: d.doctorCode || 'Doctor',
      meta: { fee: d.consultationFee },
      ref: `/doctors/${d._id}`,
    }));
  }

  /* users: name/username/phone/email */
  if (grant('users')) {
    const docs = await User.find({
      $or: [{ firstName: regex(query) }, { lastName: regex(query) }, { username: regex(query) }, { email: regex(query) }, { phone: regex(query) }],
    })
      .select('firstName lastName username roleCode phone email')
      .limit(per);
    out.results.users = docs.map((u) => ({
      type: 'user',
      id: u._id,
      label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
      subtitle: `${u.roleCode || 'USER'} · ${u.username}`,
      meta: { username: u.username, role: u.roleCode, email: u.email },
      ref: `/users/${u._id}`,
    }));
  }

  /* medicines: text index */
  if (grant('medicines')) {
    const docs = await Medicine.find(query.length >= 3 ? textMatch(query) : { $or: [{ name: regex(query) }, { genericName: regex(query) }, { brand: regex(query) }] })
      .select('name genericName brand unit isActive')
      .limit(per);
    out.results.medicines = docs.map((m) => ({
      type: 'medicine',
      id: m._id,
      label: m.name,
      subtitle: [m.genericName, m.brand, m.unit].filter(Boolean).join(' · ') || 'Medicine',
      meta: { genericName: m.genericName, unit: m.unit },
      ref: `/pharmacy?medicine=${m._id}`,
    }));
  }

  /* appointments: number prefix + populated patient/doctor */
  if (grant('appointments')) {
    const docs = await Appointment.find({ appointmentNumber: regex(query) })
      .populate('patientId', 'firstName lastName uhid')
      .populate('doctorId', 'name')
      .sort({ date: -1 })
      .limit(per);
    out.results.appointments = docs.map((a) => ({
      type: 'appointment',
      id: a._id,
      label: `${a.appointmentNumber}${a.patientId ? ` · ${a.patientId.fullName?.() || a.patientId.firstName}` : ''}`,
      subtitle: `${a.doctorId?.name || ''} · ${a.status}${a.date ? ` · ${new Date(a.date).toLocaleDateString('en-IN')}` : ''}`,
      meta: { patientId: a.patientId?._id, doctorId: a.doctorId?._id, status: a.status },
      ref: a.patientId ? `/patients/${a.patientId._id}` : undefined,
    }));
  }

  /* bills: number prefix */
  if (grant('bills')) {
    const docs = await Bill.find({ billNumber: regex(query) })
      .populate('patientId', 'firstName lastName uhid')
      .sort({ billDate: -1 })
      .limit(per);
    out.results.bills = docs.map((b) => ({
      type: 'bill',
      id: b._id,
      label: `${b.billNumber}${b.patientId ? ` · ${b.patientId.fullName?.() || b.patientId.firstName}` : ''}`,
      subtitle: `${b.billType} · ${b.status} · ₹${(b.netTotal ?? 0).toFixed(2)}${b.dueAmount ? ` (due ₹${b.dueAmount.toFixed(2)})` : ''}`,
      meta: { patientId: b.patientId?._id, status: b.status, netTotal: b.netTotal, dueAmount: b.dueAmount },
      ref: b.patientId ? `/patients/${b.patientId._id}` : undefined,
    }));
  }

  /* admissions (IPD) */
  if (grant('admissions')) {
    const docs = await IpdAdmission.find({ admissionNumber: regex(query) })
      .populate('patientId', 'firstName lastName uhid')
      .sort({ admittedAt: -1 })
      .limit(per);
    out.results.admissions = docs.map((a) => ({
      type: 'admission',
      id: a._id,
      label: `${a.admissionNumber}${a.patientId ? ` · ${a.patientId.fullName?.() || a.patientId.firstName}` : ''}`,
      subtitle: `${a.status}${a.wardId ? '' : ''}${a.admittedAt ? ` · ${new Date(a.admittedAt).toLocaleDateString('en-IN')}` : ''}`,
      meta: { patientId: a.patientId?._id, status: a.status },
      ref: a.patientId ? `/patients/${a.patientId._id}` : `/ipd?admission=${a._id}`,
    }));
  }

  /* beds */
  if (grant('beds')) {
    const docs = await Bed.find({
      $or: [{ bedNumber: regex(query) }, { code: regex(query) }],
      active: true,
    })
      .populate('wardId', 'name wardType')
      .limit(per);
    out.results.beds = docs.map((b) => ({
      type: 'bed',
      id: b._id,
      label: b.code || b.bedNumber,
      subtitle: `${b.wardId?.name || 'Ward'} · ${b.bedType} · ${b.status}`,
      meta: { wardId: b.wardId?._id, status: b.status },
      ref: `/ipd${b.currentAdmissionId ? `?bed=${b._id}` : `?bed=${b._id}`}`,
    }));
  }

  return out;
};