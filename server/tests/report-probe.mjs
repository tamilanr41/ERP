import { MongoMemoryReplSet } from 'mongodb-memory-server';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGO_URI = replSet.getUri('hospital_erp');
process.env.NODE_ENV = 'test';
const { connectDB } = await import('../src/config/db.js');
const { bootstrapRoles } = await import('../src/services/auth.service.js');
const { default: Role } = await import('../src/models/Role.model.js');
const { default: User } = await import('../src/models/User.model.js');
const { default: Hospital } = await import('../src/models/Hospital.model.js');
const { default: Doctor } = await import('../src/models/Doctor.model.js');
const { default: Supplier } = await import('../src/models/Supplier.model.js');
const { default: Patient } = await import('../src/models/Patient.model.js');
const { default: Medicine } = await import('../src/models/Medicine.model.js');
const { default: MedicineBatch } = await import('../src/models/MedicineBatch.model.js');
const { default: LabTest } = await import('../src/models/LabTest.model.js');
const { Ward, Bed } = await import('../src/models/Bed.model.js');
const { default: Appointment } = await import('../src/models/Appointment.model.js');
const { default: Bill } = await import('../src/models/Bill.model.js');
const { default: Payment } = await import('../src/models/Payment.model.js');

const { runReport, toCSV, flatten } = await import('../src/services/report.service.js');

await connectDB();
await bootstrapRoles();

const admin = await User.create({ username: 'superadmin', passwordHash: 'Admin@123', firstName: 'S', role: (await Role.findOne({ name: 'SUPER_ADMIN' }))._id, roleCode: 'SUPER_ADMIN' });
const h = await Hospital.create({ name: 'Test Hospital', code: 'MAIN' });
const dept = (await import('../src/models/Department.model.js')).default;
const dep = await dept.create({ name: 'General Medicine' });
const doc = await Doctor.create({ name: 'Dr Ravi', doctorCode: 'RK1', departmentId: dep._id });
for (let i = 0; i < 10; i++) {
  const p = await Patient.create({ firstName: 'P' + i, lastName: 'L', gender: 'MALE', mobile: '98' + String(6000000000 + i), uhid: 'UHID-' + i, registrationNumber: 'REG-' + i, address: { city: 'Chennai' }, registeredBy: admin._id, hospitalId: h._id });
  await Appointment.create({ appointmentNumber: 'APT-' + i, patientId: p._id, doctorId: doc._id, date: new Date(), time: '10:00', tokenNumber: i + 1, type: 'OPD', status: 'CONFIRMED', bookedBy: admin._id, hospitalId: h._id });
}
const sup = await Supplier.create({ name: 'Sup', contact: {} });
const med = await Medicine.create({ name: 'M', genericName: 'G', unit: 'TAB', hospitalId: h._id });
await MedicineBatch.create({ medicineId: med._id, batchNumber: 'B1', quantity: 100, purchaseRate: 8, sellingRate: 10, mrp: 12, expiryDate: new Date(Date.now() + 999999999), initialQuantity: 100, supplierId: sup._id, hospitalId: h._id });
await LabTest.create({ name: 'CBC', code: 'CBC', price: 100, sampleType: 'BLOOD' });

const time = async (label, fn) => {
  const t0 = Date.now();
  const out = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT 15s')), 15000))]);
  console.log(`${label}: ${Date.now() - t0}ms`, Array.isArray(out) ? `rows=${out.length}` : typeof out);
  return out;
};

await time('runReport(patients)', () => runReport('patients', {}));
const rows = await runReport('patients', {});
await time('toCSV(10 patients)', () => toCSV(rows));
await time('runReport(opd)', () => runReport('opd', {}));
await time('runReport(ipd)', () => runReport('ipd', {}));
await time('runReport(bills)', () => runReport('bills', {}));
await time('runReport(payments)', () => runReport('payments', {}));
await time('runReport(pharmacy_sales)', () => runReport('pharmacy_sales', {}));
await time('runReport(pharmacy_purchases)', () => runReport('pharmacy_purchases', {}));
await time('runReport(lab_orders)', () => runReport('lab_orders', {}));
await time('runReport(collection)', () => runReport('collection', {}));
await time('runReport(outstanding)', () => runReport('outstanding', {}));
await time('runReport(expiring)', () => runReport('expiring', {}));
await time('runReport(low_stock)', () => runReport('low_stock', {}));

process.exit(0);
