import mongoose from 'mongoose';
import IpdAdmission, { ADMISSION_STATUS, DISCHARGE_TYPE } from '../models/IpdAdmission.model.js';
import PatientTransfer, { TRANSFER_TYPES, TRANSFER_STATUS } from '../models/PatientTransfer.model.js';
import PatientDocument, { IPD_DOCUMENT_TYPES } from '../models/PatientDocument.model.js';
import Patient from '../models/Patient.model.js';
import { Bed, Ward, Room, BedHistory, BED_STATUS } from '../models/Bed.model.js';
import { generateNumber } from '../utils/numberGenerator.js';
import { emitIpd, IPD_SOCKET_EVENTS } from '../utils/socket.io.server.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';

const ACTIVE_STATUSES = [ADMISSION_STATUS.ADMITTED, ADMISSION_STATUS.TRANSFERRED, ADMISSION_STATUS.DISCHARGE_PLANNED];

const getAdmission = async (id) => {
  const admission = await IpdAdmission.findById(id);
  if (!admission) throw new NotFoundError('Admission not found');
  return admission;
};

// ============================================================
// 36. PATIENT TRANSFER
// ============================================================
const locationOf = async ({ wardId, roomId, bedId }) => {
  if (!wardId && !roomId && !bedId) return { wardName: null, roomNumber: null, bedNumber: null };
  const [ward, room, bed] = await Promise.all([
    wardId ? Ward.findById(wardId).select('name') : null,
    roomId ? Room.findById(roomId).select('roomNumber') : null,
    bedId ? Bed.findById(bedId).select('bedNumber code chargePerDay') : null,
  ]);
  return {
    wardId, wardName: ward?.name,
    roomId, roomNumber: room?.roomNumber,
    bedId, bedNumber: bed?.bedNumber || bed?.code,
  };
};

const resolveFrom = async (admission) => {
  if (admission.bedId) {
    const bed = await Bed.findById(admission.bedId).select('bedNumber code');
    const loc = await locationOf({ wardId: admission.wardId, roomId: admission.roomId, bedId: admission.bedId });
    return { ...loc, bedNumber: bed?.bedNumber || bed?.code || loc.bedNumber };
  }
  const loc = await locationOf({ wardId: admission.wardId, roomId: admission.roomId });
  return { ...loc, bedNumber: null };
};

/**
 * Section 49: a destination must be internally consistent — the ward must exist,
 * the room must belong to that ward, and the bed must belong to that room/ward.
 * Without this, a transfer can record a location that does not exist.
 */
const assertDestinationConsistent = async ({ wardId, roomId, bedId }, admission) => {
  let bed = null;
  if (bedId) {
    bed = await Bed.findById(bedId);
    if (!bed) throw new NotFoundError('Destination bed not found');
    if (![BED_STATUS.AVAILABLE, BED_STATUS.RESERVED].includes(bed.status)) {
      throw new ConflictError(`Destination bed ${bed.bedNumber} is ${bed.status}`);
    }
    if (String(bed._id) === String(admission.bedId)) {
      throw new BadRequestError('Patient already occupies that bed');
    }
    if (wardId && String(bed.wardId) !== String(wardId)) {
      throw new BadRequestError('Destination bed does not belong to the selected ward');
    }
    if (roomId && String(bed.roomId) !== String(roomId)) {
      throw new BadRequestError('Destination bed does not belong to the selected room');
    }
  }
  if (roomId) {
    const room = await Room.findById(roomId).select('wardId roomNumber');
    if (!room) throw new NotFoundError('Destination room not found');
    if (wardId && String(room.wardId) !== String(wardId)) {
      throw new BadRequestError('Destination room does not belong to the selected ward');
    }
  }
  if (wardId) {
    const ward = await Ward.findById(wardId).select('name status');
    if (!ward) throw new NotFoundError('Destination ward not found');
    if (ward.status && ward.status !== 'ACTIVE') {
      throw new BadRequestError(`Destination ward ${ward.name} is ${ward.status}`);
    }
  }
  if (!bedId && !wardId) throw new BadRequestError('Destination ward or bed is required');
  return bed;
};

export const createTransferRequest = async (admissionId, payload, actor) => {
  const admission = await getAdmission(admissionId);
  if (!ACTIVE_STATUSES.includes(admission.status)) {
    throw new BadRequestError(`Transfers apply to active admissions (this one is ${admission.status})`);
  }
  if (!Object.values(TRANSFER_TYPES).includes(payload.transferType)) {
    throw new BadRequestError('Valid transfer type is required');
  }
  if (!payload.reason) throw new BadRequestError('Transfer reason is required');

  const isExternal = payload.transferType === TRANSFER_TYPES.ANOTHER_HOSPITAL;
  if (isExternal) {
    if (!payload.to?.hospitalName) throw new BadRequestError('Destination hospital is required');
  } else {
    await assertDestinationConsistent({
      wardId: payload.to?.wardId,
      roomId: payload.to?.roomId,
      bedId: payload.to?.bedId,
    }, admission);
  }

  const patient = await Patient.findById(admission.patientId).select('firstName lastName uhid');
  const from = await resolveFrom(admission);
  const to = isExternal
    ? {
      hospitalName: payload.to.hospitalName,
      hospitalAddress: payload.to.hospitalAddress,
      contactNumber: payload.to.contactNumber,
      contactPerson: payload.to.contactPerson,
    }
    : await locationOf({ wardId: payload.to.wardId, roomId: payload.to.roomId, bedId: payload.to.bedId });

  const transfer = await PatientTransfer.create({
    transferNumber: await generateNumber('TRF', new Date().getFullYear()),
    admissionId,
    patientId: admission.patientId,
    admissionNumber: admission.admissionNumber,
    patientName: patient ? `${patient.firstName} ${patient.lastName || ''}`.trim() : undefined,
    transferType: payload.transferType,
    from,
    to,
    reason: payload.reason,
    clinicalNotes: payload.clinicalNotes,
    transportMode: payload.transportMode || 'AMBULANCE',
    vehicleNumber: payload.vehicleNumber,
    attendantName: payload.attendantName,
    attendantPhone: payload.attendantPhone,
    attendantRelation: payload.attendantRelation,
    nurseId: payload.nurseId,
    requestedBy: actor?.id,
    status: TRANSFER_STATUS.REQUESTED,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });

  emitIpd(IPD_SOCKET_EVENTS.PATIENT_TRANSFERRED, {
    transferId: transfer._id, admissionNumber: admission.admissionNumber, status: transfer.status, transferType: transfer.transferType,
  }, admissionId);
  return transfer;
};

export const approveTransfer = async (transferId, payload, actor) => {
  const transfer = await PatientTransfer.findById(transferId);
  if (!transfer) throw new NotFoundError('Transfer request not found');
  if (transfer.status !== TRANSFER_STATUS.REQUESTED) {
    throw new BadRequestError(`Transfer is already ${transfer.status}`);
  }
  if (payload.approve === false) {
    transfer.status = TRANSFER_STATUS.REJECTED;
    transfer.rejectedReason = payload.reason;
    await transfer.save();
    emitIpd(IPD_SOCKET_EVENTS.PATIENT_TRANSFERRED, { transferId, status: transfer.status }, transfer.admissionId);
    return transfer;
  }
  transfer.status = TRANSFER_STATUS.APPROVED;
  transfer.approvedBy = actor?.id;
  transfer.approvedAt = new Date();
  await transfer.save();
  emitIpd(IPD_SOCKET_EVENTS.PATIENT_TRANSFERRED, { transferId, status: transfer.status }, transfer.admissionId);
  return transfer;
};

/** Complete the transfer: move the bed (internal) or release it (external). */
export const completeTransfer = async (transferId, payload, actor) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const transfer = await PatientTransfer.findById(transferId).session(session);
    if (!transfer) throw new NotFoundError('Transfer request not found');
    if (![TRANSFER_STATUS.REQUESTED, TRANSFER_STATUS.APPROVED, TRANSFER_STATUS.IN_PROGRESS].includes(transfer.status)) {
      throw new BadRequestError(`Transfer is ${transfer.status} and cannot be completed`);
    }

    const admission = await IpdAdmission.findById(transfer.admissionId).session(session);
    if (!admission) throw new NotFoundError('Admission not found');
    if (!ACTIVE_STATUSES.includes(admission.status)) {
      throw new BadRequestError(`Admission is ${admission.status} — transfer can no longer be completed`);
    }

    transfer.departedAt = payload.departedAt ? new Date(payload.departedAt) : new Date();
    transfer.arrivedAt = payload.arrivedAt ? new Date(payload.arrivedAt) : new Date();
    transfer.status = TRANSFER_STATUS.COMPLETED;
    transfer.completedAt = new Date();
    if (!transfer.approvedBy) { transfer.approvedBy = actor?.id; transfer.approvedAt = new Date(); }

    if (transfer.transferType === TRANSFER_TYPES.ANOTHER_HOSPITAL) {
      // leaving the hospital: free the bed and close the admission as a transfer-out
      if (admission.bedId) {
        const bed = await Bed.findById(admission.bedId).session(session);
        if (bed && bed.status === BED_STATUS.OCCUPIED) {
          await BedHistory.create([{
            bedId: bed._id,
            admissionId: admission._id,
            patientId: admission.patientId,
            action: 'RELEASE',
            from: BED_STATUS.OCCUPIED,
            to: BED_STATUS.CLEANING,
            reason: `Transferred to ${transfer.to.hospitalName}`,
            chargePerDay: bed.chargePerDay,
            changedBy: actor?.id,
          }], { session, ordered: true });
          bed.status = BED_STATUS.CLEANING;
          bed.currentAdmissionId = null;
          await bed.save({ session });
        }
      }
      transfer.bedReleased = true;
      admission.status = ADMISSION_STATUS.DISCHARGED;
      admission.dischargeType = DISCHARGE_TYPE.TRANSFERRED;
      admission.dischargeStage = 'DISCHARGED';
      admission.dischargedAt = new Date();
      admission.dischargeReason = `Transferred to ${transfer.to.hospitalName}`;
      admission.dischargeDocuments = {
        documentType: 'TRANSFER_LETTER',
        referenceNumber: transfer.transferNumber,
        notes: transfer.reason,
        recordedAt: new Date(),
        recordedBy: actor?.id,
      };
      await admission.save({ session });
    } else if (transfer.to.bedId) {
      // internal move: free old bed, occupy the new one, record both history rows
      const newBed = await Bed.findById(transfer.to.bedId).session(session);
      if (!newBed) throw new NotFoundError('Destination bed not found');
      if (String(newBed._id) === String(admission.bedId)) {
        throw new BadRequestError('Patient already occupies that bed');
      }
      if (admission.bedId) {
        const oldBed = await Bed.findById(admission.bedId).session(session);
        if (oldBed) {
          await BedHistory.create([{
            bedId: oldBed._id, admissionId: admission._id, patientId: admission.patientId,
            action: 'RELEASE', from: BED_STATUS.OCCUPIED, to: BED_STATUS.AVAILABLE,
            reason: `Transfer ${transfer.transferNumber} — ${transfer.transferType}`, chargePerDay: oldBed.chargePerDay, changedBy: actor?.id,
          }], { session, ordered: true });
          await Bed.findOneAndUpdate(
            { _id: oldBed._id, currentAdmissionId: admission._id },
            { $set: { status: BED_STATUS.AVAILABLE, currentAdmissionId: null } },
            { session },
          );
        }
      }
      // atomic claim: the bed must still be free at the moment of the move
      const claimed = await Bed.findOneAndUpdate(
        {
          _id: transfer.to.bedId,
          status: { $in: [BED_STATUS.AVAILABLE, BED_STATUS.RESERVED] },
          $or: [{ currentAdmissionId: null }, { currentAdmissionId: admission._id }],
        },
        { $set: { status: BED_STATUS.OCCUPIED, currentAdmissionId: admission._id } },
        { new: true, session },
      );
      if (!claimed) {
        const current = await Bed.findById(transfer.to.bedId).session(session);
        throw new ConflictError(`Destination bed ${current?.bedNumber || transfer.to.bedId} is ${current?.status} — it was taken by another admission`);
      }
      newBed.status = claimed.status;
      newBed.currentAdmissionId = claimed.currentAdmissionId;

      const [history] = await BedHistory.create([{
        bedId: newBed._id, admissionId: admission._id, patientId: admission.patientId,
        action: 'TRANSFER', from: transfer.from.bedNumber || transfer.from.wardName, to: newBed.bedNumber,
        reason: `${transfer.transferType} transfer — ${transfer.reason}`, chargePerDay: newBed.chargePerDay, changedBy: actor?.id,
      }], { session, ordered: true });

      admission.bedId = newBed._id;
      admission.wardId = newBed.wardId;
      admission.roomId = newBed.roomId;
      admission.bedHistory.push(history._id);
      admission.status = ADMISSION_STATUS.TRANSFERRED;
      await admission.save({ session });
      transfer.bedAllocated = true;
    } else if (transfer.to.wardId) {
      // ward-level move without a bed change — the ward must still exist
      const ward = await Ward.findById(transfer.to.wardId).session(session).select('_id');
      if (!ward) throw new NotFoundError('Destination ward no longer exists');
      if (transfer.to.roomId) {
        const room = await Room.findById(transfer.to.roomId).session(session).select('wardId');
        if (!room) throw new NotFoundError('Destination room no longer exists');
        if (String(room.wardId) !== String(transfer.to.wardId)) {
          throw new BadRequestError('Destination room does not belong to the destination ward');
        }
      }
      admission.wardId = transfer.to.wardId;
      if (transfer.to.roomId) admission.roomId = transfer.to.roomId;
      await admission.save({ session });
    }

    await transfer.save({ session });
    emitIpd(IPD_SOCKET_EVENTS.PATIENT_TRANSFERRED, {
      transferId, status: transfer.status, transferType: transfer.transferType,
      bedReleased: transfer.bedReleased, bedAllocated: transfer.bedAllocated,
    }, admission._id);
    emitIpd(IPD_SOCKET_EVENTS.BED_BOARD_UPDATED, { reason: 'transfer' });

    await session.commitTransaction();
    return transfer;
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const listTransfers = async (admissionId) => PatientTransfer.find({ admissionId })
  .populate('requestedBy', 'name')
  .populate('approvedBy', 'name')
  .populate('nurseId', 'name')
  .sort({ requestedAt: -1 });

export const listPendingTransfers = async () => PatientTransfer.find({ status: { $in: [TRANSFER_STATUS.REQUESTED, TRANSFER_STATUS.APPROVED] } })
  .populate('patientId', 'firstName lastName uhid')
  .sort({ requestedAt: 1 });

// ============================================================
// 38. IPD DOCUMENT MANAGEMENT
// ============================================================
const requireDocType = (t) => {
  if (!IPD_DOCUMENT_TYPES.includes(t)) throw new BadRequestError(`Unknown document type: ${t}`);
  return t;
};

/** List every document linked to an admission (uploaded + generated). */
export const listIpdDocuments = async (admissionId) => {
  const admission = await IpdAdmission.findById(admissionId).select('admissionNumber patientId');
  if (!admission) throw new NotFoundError('Admission not found');
  const docs = await PatientDocument.find({ admissionId })
    .populate('uploadedBy', 'name')
    .sort({ createdDate: -1 });
  return { admissionNumber: admission.admissionNumber, documents: docs };
};

export const linkDocument = async (admissionId, payload, actor) => {
  const admission = await IpdAdmission.findById(admissionId).select('admissionNumber patientId');
  if (!admission) throw new NotFoundError('Admission not found');
  if (!payload.title) throw new BadRequestError('Document title is required');
  const documentType = payload.documentType ? requireDocType(payload.documentType) : undefined;

  return PatientDocument.create({
    patientId: admission.patientId,
    admissionId,
    ipNumber: admission.admissionNumber,
    title: payload.title,
    category: payload.category || 'GENERAL',
    documentType,
    fileType: payload.fileType,
    fileName: payload.fileName,
    fileSize: payload.fileSize,
    filePath: payload.filePath,
    fileUrl: payload.fileUrl,
    notes: payload.notes,
    uploadedBy: actor?.id,
    createdDate: new Date(),
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
};

/**
 * Register a document produced by the system (discharge summary, final bill,
 * receipt, MAR…). Idempotent per source record and keeps a content snapshot
 * so the document stays even if the source is later superseded.
 */
export const registerGeneratedDocument = async ({ admissionId, patientId, ipNumber, documentType, sourceType, sourceId, title, snapshot, actor }) => {
  requireDocType(documentType);
  const existing = await PatientDocument.findOne({ sourceType, sourceId });
  if (existing) return existing;
  return PatientDocument.create({
    patientId,
    admissionId,
    ipNumber,
    title,
    category: documentType === 'INSURANCE_DOCUMENT' ? 'INSURANCE_DOCUMENT'
      : documentType === 'DISCHARGE_SUMMARY' ? 'DISCHARGE_SUMMARY'
        : documentType === 'PRESCRIPTION' ? 'PRESCRIPTION' : 'GENERAL',
    documentType,
    sourceType,
    sourceId,
    generatedAt: new Date(),
    contentSnapshot: snapshot,
    createdDate: new Date(),
    uploadedBy: actor?.id,
  });
};

export const documentsForAdmission = async (admissionId) => {
  const docs = await PatientDocument.find({ admissionId }).populate('uploadedBy', 'name').sort({ createdDate: -1 }).lean();
  const grouped = {};
  for (const d of docs) {
    const key = d.documentType || 'OTHER';
    grouped[key] = grouped[key] || { documentType: key, count: 0, documents: [] };
    grouped[key].count += 1;
    grouped[key].documents.push(d);
  }
  return { total: docs.length, grouped, documents: docs };
};
