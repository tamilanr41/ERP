import mongoose from 'mongoose';
import dotenv from 'dotenv';
import config from '../config/index.js';
import { bootstrapRoles } from '../services/auth.service.js';
import User from '../models/User.model.js';
import Role from '../models/Role.model.js';
import Hospital from '../models/Hospital.model.js';
import Department from '../models/Department.model.js';
import Doctor from '../models/Doctor.model.js';
import Patient from '../models/Patient.model.js';
import Medicine from '../models/Medicine.model.js';
import MedicineBatch from '../models/MedicineBatch.model.js';
import Supplier from '../models/Supplier.model.js';
import LabTest from '../models/LabTest.model.js';
import { Bed, Ward } from '../models/Bed.model.js';
import Appointment from '../models/Appointment.model.js';
import IpdAdmission from '../models/IpdAdmission.model.js';
import VitalRecord from '../models/VitalRecord.model.js';
import NursingNote from '../models/NursingNote.model.js';
import ClinicalNote from '../models/ClinicalNote.model.js';
import MedicationChart from '../models/MedicationChart.model.js';
import ClinicalOrder from '../models/ClinicalOrder.model.js';
import Bill, { BILL_STATUS } from '../models/Bill.model.js';
import Payment from '../models/Payment.model.js';
import { generateNumber, generateUHID, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import ModuleRecord from '../models/ModuleRecord.model.js';
import { prefixFor } from '../services/module.service.js';
import logger from '../config/logger.js';

dotenv.config();

const seed = async () => {
  await bootstrapRoles();
  logger.info('Roles seeded');

  const hospital = await Hospital.findOneAndUpdate(
    { code: 'MAIN' },
    {
      $setOnInsert: {
        name: 'MediCore General Hospital',
        code: 'MAIN',
        phone: '+91 98765 43210',
        email: 'info@medicore.example',
        gstNumber: 'GSTIN1234567890',
        address: { line1: '12 MG Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
        billing: { invoicePrefix: 'BILL', receiptPrefix: 'REC', patientIdPrefix: 'UHID', admissionPrefix: 'IPD', opdPrefix: 'OPD' },
        tax: { defaultGstPct: 12, currency: 'INR', currencySymbol: '₹' },
      },
    },
    { new: true, upsert: true },
  );
  logger.info('Hospital ready');

  const deptDefs = ['Cardiology', 'General Medicine', 'Pediatrics', 'Orthopedics', 'Gynecology', 'Neurology', 'Dermatology', 'ENT', 'Ophthalmology', 'Emergency', 'Radiology', 'Pathology', 'Pharmacy'];
  const departmentIds = {};
  for (const name of deptDefs) {
    const dept = await Department.findOneAndUpdate({ name }, { $setOnInsert: { name } }, { new: true, upsert: true });
    departmentIds[name] = dept._id;
  }
  logger.info('Departments ready');

  // ===== USERS =====
  const roleByName = async (name) => Role.findOne({ name });
  const makeUser = async ({ username, email, password, roleName, firstName, lastName, phone, departmentName }) => {
    const role = await roleByName(roleName);
    const existing = await User.findOne({ username });
    if (existing) return existing;
    return User.create({
      username, email, passwordHash: password, role: role._id, roleCode: roleName, firstName, lastName, phone,
      departmentId: departmentIds[departmentName],
      hospitalId: hospital._id,
      permissions: [],
    });
  };

  const superAdmin = await makeUser({
    username: 'superadmin', email: config.seed.adminEmail, password: config.seed.adminPassword,
    roleName: 'SUPER_ADMIN', firstName: 'System', lastName: 'Admin', phone: '+91 90000 00000',
  });
  const doctor1 = await makeUser({ username: 'dr.ravi', email: 'ravi@hospital.com', password: 'Doctor@123', roleName: 'DOCTOR', firstName: 'Ravi', lastName: 'Kumar', phone: '+91 90000 00001', departmentName: 'General Medicine' });
  const doctor2 = await makeUser({ username: 'dr.priya', email: 'priya@hospital.com', password: 'Doctor@123', roleName: 'DOCTOR', firstName: 'Priya', lastName: 'Nair', phone: '+91 90000 00002', departmentName: 'Cardiology' });
  await makeUser({ username: 'reception', email: 'reception@hospital.com', password: 'Recep@123', roleName: 'RECEPTIONIST', firstName: 'Anita', lastName: 'Sharma', phone: '+91 90000 00003' });
  await makeUser({ username: 'nurse', email: 'nurse@hospital.com', password: 'Nurse@123', roleName: 'NURSE', firstName: 'Meena', lastName: 'Thomas', phone: '+91 90000 00004' });
  await makeUser({ username: 'pharmacist', email: 'pharmacy@hospital.com', password: 'Pharm@123', roleName: 'PHARMACIST', firstName: 'Suresh', lastName: 'Reddy', phone: '+91 90000 00005' });
  await makeUser({ username: 'labtech', email: 'lab@hospital.com', password: 'Lab@123', roleName: 'LAB_TECHNICIAN', firstName: 'Kavya', lastName: 'Iyer', phone: '+91 90000 00006' });
  await makeUser({ username: 'billing', email: 'billing@hospital.com', password: 'Bill@123', roleName: 'BILLING_STAFF', firstName: 'Rahul', lastName: 'Verma', phone: '+91 90000 00007' });
  await makeUser({ username: 'accountant', email: 'accounts@hospital.com', password: 'Acc@123', roleName: 'ACCOUNTANT', firstName: 'Nikhil', lastName: 'Joshi', phone: '+91 90000 00008' });
  await makeUser({ username: 'store', email: 'store@hospital.com', password: 'Store@123', roleName: 'STORE_MANAGER', firstName: 'Arjun', lastName: 'Menon', phone: '+91 90000 00009' });
  logger.info('Users ready');

  // ===== DOCTORS =====
const doctorProfiles = [
  { user: doctor1, doctorCode: 'DOC-RK-001', name: 'Dr. Ravi Kumar', specialization: 'General Medicine', qualification: ['MBBS', 'MD'], fee: 500, dept: 'General Medicine', days: [1, 2, 3, 4, 5, 6] },
  { user: doctor2, doctorCode: 'DOC-PN-001', name: 'Dr. Priya Nair', specialization: 'Cardiology', qualification: ['MBBS', 'DM Cardiology'], fee: 800, dept: 'Cardiology', days: [1, 3, 5, 6] },
];
for (const p of doctorProfiles) {
  await Doctor.findOneAndUpdate(
    { name: p.name },
    { $setOnInsert: {
        userId: p.user._id,
        doctorCode: p.doctorCode,
        name: p.name,
        specialization: p.specialization,
        qualification: p.qualification,
        departmentId: departmentIds[p.dept],
        registrationNumber: `MCI-${Math.floor(10000 + Math.random() * 90000)}`,
        consultationFee: p.fee,
        followUpFee: p.fee * 0.5,
        availableDays: p.days,
        availability: true,
        hospitalId: hospital._id,
      } },
      { new: true, upsert: true },
    );
  }
  logger.info('Doctors ready');

  // ===== PATIENTS =====
  const patientData = [
    { firstName: 'Arun', lastName: 'Krishnan', gender: 'MALE', mobile: '9810010001', bloodGroup: 'B+', city: 'Chennai', occupation: 'Engineer', dob: new Date(1990, 3, 15) },
    { firstName: 'Divya', lastName: 'Rajan', gender: 'FEMALE', mobile: '9810010002', bloodGroup: 'O+', city: 'Bangalore', occupation: 'Teacher', dob: new Date(1995, 8, 22) },
    { firstName: 'Vijay', lastName: 'Kumar', gender: 'MALE', mobile: '9810010003', bloodGroup: 'A+', city: 'Chennai', occupation: 'Business', dob: new Date(1985, 0, 5) },
    { firstName: 'Lakshmi', lastName: 'Narayanan', gender: 'FEMALE', mobile: '9810010004', bloodGroup: 'AB+', city: 'Hyderabad', occupation: 'Doctor', dob: new Date(1988, 5, 30) },
    { firstName: 'Karthik', lastName: 'Subramanian', gender: 'MALE', mobile: '9810010005', bloodGroup: 'O-', city: 'Chennai', occupation: 'IT Professional', dob: new Date(1992, 11, 10) },
    { firstName: 'Priya', lastName: 'Menon', gender: 'FEMALE', mobile: '9810010006', bloodGroup: 'B-', city: 'Kochi', occupation: 'Nurse', dob: new Date(1998, 3, 18) },
    { firstName: 'Ramesh', lastName: 'Babu', gender: 'MALE', mobile: '9810010007', bloodGroup: 'A-', city: 'Coimbatore', occupation: 'Farmer', dob: new Date(1975, 6, 25) },
    { firstName: 'Sneha', lastName: 'Varma', gender: 'FEMALE', mobile: '9810010008', bloodGroup: 'O+', city: 'Chennai', occupation: 'Student', dob: new Date(2005, 1, 8) },
    { firstName: 'Ganesh', lastName: 'Iyer', gender: 'MALE', mobile: '9810010009', bloodGroup: 'AB-', city: 'Madurai', occupation: 'Lawyer', dob: new Date(1980, 9, 14) },
    { firstName: 'Anitha', lastName: 'Devi', gender: 'FEMALE', mobile: '9810010010', bloodGroup: 'B+', city: 'Chennai', occupation: 'Homemaker', dob: new Date(1983, 2, 2) },
  ];
  const patientIDs = [];
  for (const p of patientData) {
    const uhid = await generateUHID(null);
    const existing = await Patient.findOne({ mobile: p.mobile });
    if (existing) { patientIDs.push(existing._id); continue; }
    const patient = await Patient.create({
      ...p,
      uhid,
      registrationNumber: `REG-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
      dateOfBirth: p.dob,
      address: { line1: 'House 12', city: p.city, state: 'Tamil Nadu', pincode: '600001' },
      registeredBy: superAdmin._id,
      hospitalId: hospital._id,
    });
    patientIDs.push(patient._id);
  }
  logger.info(`Patients ready (${patientIDs.length})`);

  // ===== WARDS & BEDS =====
  let ward = await Ward.findOne({ name: 'General Ward A' });
  if (!ward) {
    ward = await Ward.create({
      name: 'General Ward A', code: 'GW-A', wardType: 'GENERAL', bedCount: 12, chargePerDay: 1200, hospitalId: hospital._id,
    });
    for (let i = 1; i <= 12; i++) {
      await Bed.create({ bedNumber: `GW-A-${i}`, code: `GW-A-${i}`, wardId: ward._id, bedType: 'GENERAL', status: 'AVAILABLE', hospitalId: hospital._id });
    }
  }
  let icuWard = await Ward.findOne({ name: 'ICU' });
  if (!icuWard) {
    icuWard = await Ward.create({ name: 'ICU', code: 'ICU', wardType: 'ICU', bedCount: 6, chargePerDay: 5000, hospitalId: hospital._id });
    for (let i = 1; i <= 6; i++) {
      await Bed.create({ bedNumber: `ICU-${i}`, code: `ICU-${i}`, wardId: icuWard._id, bedType: 'ICU', status: 'AVAILABLE', hospitalId: hospital._id });
    }
  }
  logger.info('Wards & beds ready');

  // ===== SUPPLIERS =====
  const suppliers = [
    { name: 'Sunrise Pharma Distributors', type: 'MEDICINE', phone: '9810020001', city: 'Chennai', gstNumber: 'GST-SUN-001' },
    { name: 'MedLife Supplies', type: 'SURGICAL', phone: '9810020002', city: 'Bangalore', gstNumber: 'GST-MED-002' },
    { name: 'HealthCare Logistics', type: 'GENERAL', phone: '9810020003', city: 'Hyderabad', gstNumber: 'GST-HCL-003' },
  ];
  const supplierIDs = [];
  for (const s of suppliers) {
    const sup = await Supplier.findOneAndUpdate(
      { name: s.name },
      { $setOnInsert: { ...s, contact: { phone: s.phone }, address: { city: s.city }, hospitalId: hospital._id } },
      { new: true, upsert: true },
    );
    supplierIDs.push(sup._id);
  }
  logger.info('Suppliers ready');

  // ===== MEDICINES =====
  const medicineData = [
    { name: 'Paracetamol 500mg', genericName: 'Paracetamol', unit: 'TAB', reorderLevel: 100, gstPct: 12, batch: 200 },
    { name: 'Amoxicillin 250mg', genericName: 'Amoxicillin', unit: 'CAP', reorderLevel: 80, gstPct: 12, batch: 150 },
    { name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', unit: 'TAB', reorderLevel: 60, gstPct: 12, batch: 180 },
    { name: 'Metformin 500mg', genericName: 'Metformin', unit: 'TAB', reorderLevel: 90, gstPct: 12, batch: 160 },
    { name: 'Amlodipine 5mg', genericName: 'Amlodipine', unit: 'TAB', reorderLevel: 50, gstPct: 12, batch: 140 },
    { name: 'Omeprazole 20mg', genericName: 'Omeprazole', unit: 'CAP', reorderLevel: 70, gstPct: 12, batch: 130 },
    { name: 'Azithromycin 500mg', genericName: 'Azithromycin', unit: 'TAB', reorderLevel: 40, gstPct: 12, batch: 100 },
    { name: 'Cetirizine 10mg', genericName: 'Cetirizine', unit: 'TAB', reorderLevel: 60, gstPct: 12, batch: 120 },
    { name: 'Salbutamol Inhaler', genericName: 'Salbutamol', unit: 'INH', reorderLevel: 30, gstPct: 12, batch: 50 },
    { name: 'ORS Sachet', genericName: 'Oral Rehydration Salts', unit: 'SACHET', reorderLevel: 200, gstPct: 12, batch: 300 },
  ];
  const medicineIDs = [];
  for (const m of medicineData) {
    let med = await Medicine.findOne({ name: m.name });
    if (!med) med = await Medicine.create({ ...m, hospitalId: hospital._id });
    medicineIDs.push(med._id);
    const nearExpiry = m.name === 'Paracetamol 500mg';
    const expiry = nearExpiry ? new Date(Date.now() + 45 * 24 * 3600 * 1000) : new Date(Date.now() + 300 * 24 * 3600 * 1000);
    await MedicineBatch.create({
      medicineId: med._id,
      batchNumber: `BN-${Date.now() % 100000}-${Math.floor(Math.random() * 9000 + 1000)}`,
      expiryDate: expiry,
      purchaseRate: m.batch / 10,
      sellingRate: m.batch / 6,
      mrp: m.batch / 6 + 10,
      quantity: m.batch,
      initialQuantity: m.batch,
      supplierId: supplierIDs[0],
      hospitalId: hospital._id,
    });
  }
  logger.info('Medicines ready');

  // ===== LAB TESTS =====
  const labTests = [
    { name: 'Complete Blood Count', code: 'CBC', sampleType: 'Whole Blood', container: 'EDTA Tube', price: 350, parameters: [
      { name: 'Hemoglobin', unit: 'g/dL', normalRangeLow: 12, normalRangeHigh: 16, lowerBoundCritical: 7, upperBoundCritical: 20 },
      { name: 'WBC Count', unit: '/cumm', normalRangeLow: 4000, normalRangeHigh: 11000, lowerBoundCritical: 1000, upperBoundCritical: 40000 },
      { name: 'Platelets', unit: '/cumm', normalRangeLow: 150000, normalRangeHigh: 450000, lowerBoundCritical: 20000, upperBoundCritical: 900000 },
    ] },
    { name: 'Blood Sugar (Fasting)', code: 'FBS', sampleType: 'Serum', container: 'Plain Tube', price: 120, parameters: [
      { name: 'Glucose', unit: 'mg/dL', normalRangeLow: 70, normalRangeHigh: 110, lowerBoundCritical: 30, upperBoundCritical: 500 },
    ] },
    { name: 'Lipid Profile', code: 'LIPID', sampleType: 'Serum', container: 'Plain Tube', price: 600, parameters: [
      { name: 'Total Cholesterol', unit: 'mg/dL', normalRangeLow: 125, normalRangeHigh: 200 },
      { name: 'Triglycerides', unit: 'mg/dL', normalRangeLow: 40, normalRangeHigh: 150 },
      { name: 'HDL', unit: 'mg/dL', normalRangeLow: 40, normalRangeHigh: 60 },
    ] },
    { name: 'Liver Function Test', code: 'LFT', sampleType: 'Serum', container: 'Plain Tube', price: 700, parameters: [
      { name: 'SGOT / AST', unit: 'U/L', normalRangeLow: 10, normalRangeHigh: 40, upperBoundCritical: 1000 },
      { name: 'SGPT / ALT', unit: 'U/L', normalRangeLow: 7, normalRangeHigh: 56, upperBoundCritical: 1500 },
      { name: 'Bilirubin Total', unit: 'mg/dL', normalRangeLow: 0.1, normalRangeHigh: 1.2, upperBoundCritical: 20 },
    ] },
    { name: 'Urine Analysis', code: 'URINE', sampleType: 'Urine', container: 'Sterile Cup', price: 150, parameters: [
      { name: 'Protein', unit: 'mg/dL', normalRangeLow: 0, normalRangeHigh: 15 },
      { name: 'Glucose', unit: 'mg/dL', normalRangeLow: 0, normalRangeHigh: 100 },
    ] },
    { name: 'Thyroid Profile', code: 'TFT', sampleType: 'Serum', container: 'Plain Tube', price: 550, parameters: [
      { name: 'TSH', unit: 'mIU/L', normalRangeLow: 0.4, normalRangeHigh: 4.0, lowerBoundCritical: 0.01, upperBoundCritical: 100 },
      { name: 'T3', unit: 'ng/dL', normalRangeLow: 80, normalRangeHigh: 200 },
      { name: 'T4', unit: 'ug/dL', normalRangeLow: 5, normalRangeHigh: 12 },
    ] },
    { name: 'HbA1c', code: 'HBA1C', sampleType: 'Whole Blood', container: 'EDTA Tube', price: 400, parameters: [
      { name: 'HbA1c', unit: '%', normalRangeLow: 4, normalRangeHigh: 5.7 },
    ] },
  ];
  for (const t of labTests) {
    await LabTest.findOneAndUpdate({ code: t.code }, { $setOnInsert: t }, { new: true, upsert: true });
  }
  logger.info('Lab tests ready');

  // ===== SAMPLE APPOINTMENTS & BILLS =====
  const doctorProfile = await Doctor.findOne({ name: 'Dr. Ravi Kumar' });
  const today = new Date();
  if (!(await Appointment.countDocuments())) {
    for (let i = 0; i < 6; i++) {
      const hours = 9 + i;
      await Appointment.create({
        appointmentNumber: await generateNumber(NUMBER_PREFIXES.APPOINTMENT, today.getFullYear()),
        patientId: patientIDs[i % patientIDs.length],
        doctorId: doctorProfile._id,
        departmentId: departmentIds['General Medicine'],
        date: today,
        time: `${String(hours).padStart(2, '0')}:00`,
        tokenNumber: i + 1,
        type: 'OPD',
        status: ['CONFIRMED', 'CHECKED_IN', 'SCHEDULED', 'COMPLETED', 'COMPLETED', 'IN_PROGRESS'][i],
        bookedBy: superAdmin._id,
        hospitalId: hospital._id,
      });
    }
  }
  logger.info('Appointments ready');

  const donePatientsCount = await Bill.countDocuments();
  if (!donePatientsCount) {
    const doctorName = doctorProfile.name;
    for (let i = 0; i < 5; i++) {
      const p = patientIDs[i % patientIDs.length];
      const patient = await Patient.findById(p);
      const netTotal = 150 + i * 120;
      const bill = await Bill.create({
        billNumber: await generateNumber(NUMBER_PREFIXES.BILL, today.getFullYear()),
        patientId: p, patientName: `${patient.firstName} ${patient.lastName}`, patientUHID: patient.uhid,
        billType: 'OPD', billDate: new Date(today.setHours(10 + i, 0, 0, 0) || Date.now()),
        items: [
          { itemType: 'CONSULTATION', name: `Consultation - ${doctorName}`, quantity: 1, rate: 150, total: 150 },
          ...(i % 2 === 0 ? [{ itemType: 'SERVICE', name: 'Injection', quantity: 1, rate: 60, total: 60 }] : []),
        ],
        grossTotal: netTotal, netTotal, paidAmount: i % 3 === 0 ? 0 : netTotal, dueAmount: i % 3 === 0 ? netTotal : 0,
        status: i % 3 === 0 ? BILL_STATUS.FINAL : BILL_STATUS.PAID,
        createdBy: superAdmin._id, hospitalId: hospital._id,
      });
      if (bill.paidAmount) {
        await Payment.create({
          transactionId: await generateNumber(NUMBER_PREFIXES.PAYMENT, today.getFullYear()),
          patientId: p, billId: bill._id, amount: bill.netTotal, mode: ['CASH', 'UPI', 'CARD'][i % 3],
          paidAt: new Date(), receivedBy: superAdmin._id, hospitalId: hospital._id, status: 'SUCCESS',
        });
      }
    }
  }
  logger.info('Sample bills ready');

  // ===== MODULE WORKSPACES (generic register per module/workflow) =====
  const seedWorkspaces = [
    // [moduleKey, workflow, title, reference, assignee, priority, status, amount, quantity, notes, data]
    ['telehealth', 'Video Consultation', 'Follow-up consult — fever & fatigue', 'Arun Krishnan (UHID ZMC-0000001)', 'Dr. Ravi Kumar', 'HIGH', 'IN_PROGRESS', 500, 0, 'Video link sent; awaiting patient join.', { patient: 'Arun Krishnan', consultType: 'Video', durationMins: 20, fee: 500, mode: 'Follow-up' }],
    ['telehealth', 'Download Prescription', 'Prescription — Paracetamol + ORS', 'Divya Rajan', 'Dr. Priya Nair', 'MEDIUM', 'PENDING', 0, 1, 'Rx #RX-001 generated after online consult.', { patient: 'Divya Rajan', consultType: 'Chat', durationMins: 10, fee: 300, mode: 'Follow-up' }],
    ['telehealth', 'Fix Consultation Fee', 'Teleconsultation fee revision', 'Telehealth desk', 'Dr. Priya Nair', 'LOW', 'COMPLETED', 0, 0, 'Fee set to ₹500 per session.', { patient: '—', consultType: 'Video', fee: 500, mode: 'Appointment' }],
    ['telehealth', 'Set Calendar Schedule', 'Weekly telehealth slots', 'Telehealth desk', 'Dr. Ravi Kumar', 'MEDIUM', 'PENDING', 0, 0, 'Mon–Sat 6:30 PM – 8:00 PM IST.', {}],
    ['patient-portal', 'View Consultation History', 'History request', 'Karthik Subramanian', 'Support', 'LOW', 'COMPLETED', 0, 0, 'Consults exported to patient portal.', { patient: 'Karthik Subramanian', requestType: 'History', priority: 'LOW' }],
    ['dialysis', 'Registration', 'Dialysis registration — CKD Stage 4', 'Ramesh Babu', 'Nurse Meena', 'URGENT', 'IN_PROGRESS', 2200, 1, 'Hemodialysis thrice weekly.', { patient: 'Ramesh Babu', sessionNo: 1, durationHrs: 4, nurse: 'Nurse Meena', charges: 2200, outcome: 'Completed' }],
    ['dialysis', 'Maintenance of Dialysis Detail', 'Session log — pressure & ultrafiltration', 'Ramesh Babu', 'Nurse Meena', 'HIGH', 'COMPLETED', 0, 0, 'Session 3 completed without events.', { patient: 'Ramesh Babu', sessionNo: 3, durationHrs: 4, nurse: 'Nurse Meena', outcome: 'Smooth' }],
    ['dialysis', 'Consumables Tracking', 'Dialyzer + line set stock', 'Consumables store', 'Store Arjun', 'MEDIUM', 'PENDING', 850, 12, 'Reorder dialyzer filters.', {}],
    ['multiward', 'Ward and Room Allocation', 'Allot twin room — Ward B', 'Ganesh Iyer', 'Nurse Meena', 'HIGH', 'COMPLETED', 0, 1, 'Room WB-204, bed 2.', { ward: 'Ward B', bed: 'WB-204 / B-2', serviceType: 'Nursing care', patient: 'Ganesh Iyer' }],
    ['multiward', 'Request for Service & Pharmacy Order', 'Ward service request', 'General Ward A', 'Nurse Meena', 'MEDIUM', 'PENDING', 2400, 0, 'Nebulization kit + pulse oximeter.', { ward: 'General Ward A', serviceType: 'Pharmacy order', patient: '—' }],
    ['mrd', 'Registration and Classification', 'MRD file registration', 'Sneha Varma', 'MRD clerk', 'LOW', 'IN_PROGRESS', 0, 1, 'File classified under OPD.', { uhid: 'ZMC-0000009', fileType: 'Reports', location: 'Archive Rack 2', requestor: 'MRD clerk' }],
    ['mrd', 'Request Medical Record', 'Case sheet request for review', 'IPD-2025-0012', 'MRD clerk', 'HIGH', 'PENDING', 0, 0, 'Requested by Dr. Ravi Kumar.', { uhid: 'IPD-2025-0012', fileType: 'Case sheet', location: 'MRD desk', requestor: 'Dr. Ravi Kumar' }],
    ['mrd', 'Issue Medical Record', 'Issue file to OPD-3', 'IPD-2025-0008', 'MRD clerk', 'MEDIUM', 'COMPLETED', 0, 1, 'Issued & signed.', { uhid: 'IPD-2025-0008', fileType: 'Case sheet', location: 'OPD-3', requestor: 'Dr. Priya Nair' }],
    ['theatre', 'Theatre Booking', 'Appendectomy — OT 2', 'Vijay Kumar', 'Dr. Priya Nair', 'URGENT', 'IN_PROGRESS', 18000, 1, 'Surg team assigned.', { patient: 'Vijay Kumar', procedure: 'Appendectomy', theatre: 'OT 2', surgeon: 'Dr. Priya Nair', anaesthetist: 'Dr. Anand', estCost: 18000 }],
    ['theatre', 'Operation Notes', 'Post-op notes — appendectomy', 'Vijay Kumar', 'Dr. Priya Nair', 'HIGH', 'COMPLETED', 0, 0, 'Uneventful. Extubated OK.', { patient: 'Vijay Kumar', procedure: 'Appendectomy', theatre: 'OT 2', surgeon: 'Dr. Priya Nair', anaesthetist: 'Dr. Anand' }],
    ['theatre', 'Surgeons, Anaesthetists & Nurses Assignment', 'Team for total hip arthroplasty', 'Ortho OT', 'Dr. Ravi Kumar', 'HIGH', 'PENDING', 0, 1, 'Anaesthetist + 2 OT nurses.', { patient: 'Ortho OT', procedure: 'Total hip arthroplasty', theatre: 'OT 3', surgeon: 'Dr. Ravi Kumar', anaesthetist: 'Dr. Anand' }],
    ['cssd', 'Identify Instrument Sets', 'Laparotomy set identification', 'CSSD', 'CSSD staff', 'MEDIUM', 'COMPLETED', 0, 3, '3 sets tagged.', { set: 'Laparotomy set A-12', packs: 3, stage: 'Received' }],
    ['cssd', 'Sterilize Instrument Sets', 'Autoclave cycle — set A-12', 'CSSD', 'CSSD staff', 'HIGH', 'IN_PROGRESS', 0, 1, 'Cycle 134°C / 20 min.', { set: 'Laparotomy set A-12', method: 'Autoclave', cycleNo: 142, packs: 1, stage: 'Sterilised' }],
    ['cssd', 'Issue Instrument Sets to OT / Ward', 'Issue laparotomy sets to OT 2', 'OT 2', 'CSSD staff', 'MEDIUM', 'PENDING', 0, 2, 'Signed issue register.', { set: 'Laparotomy set A-12', method: 'Autoclave', packs: 2, stage: 'Issued' }],
    ['catering', 'Diet Planning', 'Diabetic diet plan — 1800 kcal', 'Divya Rajan', 'Dietician', 'MEDIUM', 'PENDING', 0, 7, '7-day plan with snacks.', { patient: 'Divya Rajan', dietType: 'Diabetic', meals: 3, days: 7 }],
    ['catering', 'Diet Dispatch', 'Dispatch — ward trays', 'General Ward A', 'Kitchen', 'LOW', 'COMPLETED', 0, 24, '24 trays dispatched.', { patient: 'General Ward A', dietType: 'Normal', meals: 3, days: 1 }],
    ['equipment', 'Bar Code Printer and Reader', 'Barcode printer calibration', 'Pharmacy outlet', 'IT support', 'LOW', 'COMPLETED', 0, 1, 'Zebra printer OK.', { device: 'Zebra ZD421', category: 'Bar code', location: 'Pharmacy outlet', interface: 'USB' }],
    ['housekeeping', 'Linen Issue / Return', 'Linen issue — Ward A', 'Housekeeping', 'HK supervisor', 'LOW', 'COMPLETED', 0, 40, 'Sheets + gowns issued.', { location: 'Ward A', taskType: 'Linen issue', qty: 40, staff: 'HK team' }],
    ['housekeeping', 'Complaint Registration and Tracking', 'AC not cooling — Room 204', 'Room WB-204', 'HK supervisor', 'HIGH', 'IN_PROGRESS', 0, 0, 'Logged to maintenance.', { location: 'Room WB-204', taskType: 'Complaint', qty: 1, staff: 'Maintenance' }],
    ['purchase', 'Purchase Order', 'PO — surgical gloves 5000 pcs', 'Sunrise Pharma', 'Store Arjun', 'HIGH', 'IN_PROGRESS', 24500, 5000, 'Rate ₹4.90/pc.', { supplier: 'Sunrise Pharma', item: 'Surgical gloves', itemType: 'Consumable', qty: 5000, unitCost: 4.9 }],
    ['purchase', 'Goods Receipts and Issue', 'GRN for gloves + ORS stock', 'HealthCare Logistics', 'Store Arjun', 'MEDIUM', 'PENDING', 0, 0, 'Awaiting delivery.', { supplier: 'HealthCare Logistics', item: 'Gloves + ORS', itemType: 'Consumable', unitCost: 4.9 }],
    ['hrm', 'Staff Details', 'New nurse onboarding', 'HR desk', 'HR manager', 'MEDIUM', 'IN_PROGRESS', 0, 1, 'KYC + credentials pending.', { staff: 'HR desk', role: 'Nurse', department: 'Ward B', action: 'Hire' }],
    ['hrm', 'Leaves', 'Casual leave request', 'Meena Thomas', 'HR manager', 'LOW', 'COMPLETED', 0, 2, 'Approved 2 days.', { staff: 'Meena Thomas', role: 'Nurse', department: 'Dialysis', action: 'Leave' }],
    ['finance', 'General Ledger', 'Month-end ledger reconcile', 'Accounts', 'Nikhil Joshi', 'HIGH', 'IN_PROGRESS', 0, 0, 'Reconciling bank book.', { account: 'Bank', entryType: 'Debit', period: 'Sep 2026' }],
    ['finance', 'Cash / Bank Book', 'Daily cash book entry', 'Accounts', 'Nikhil Joshi', 'MEDIUM', 'PENDING', 84500, 0, 'Closing balance ₹84,500.', { account: 'Cash', entryType: 'Debit', amount: 84500, period: 'Sep 2026' }],
    ['ticketing', 'Create Ticket', 'Printer at billing counter down', 'IT helpdesk', 'IT support', 'HIGH', 'IN_PROGRESS', 0, 1, 'Ticket #TCK-0012.', { reporter: 'IT helpdesk', category: 'Hardware', urgency: 'High', location: 'Billing counter' }],
    ['ticketing', 'Resolve Ticket', 'Printer driver reinstall', 'Billing counter', 'IT support', 'MEDIUM', 'COMPLETED', 0, 0, 'Resolved in 40 min.', { reporter: 'Billing counter', category: 'Hardware', urgency: 'Medium', location: 'Billing counter' }],
    ['ambulance', 'Trip Sheet', 'Ambulance trip — emergency pickup', 'Ambulance 01', 'Driver Suresh', 'URGENT', 'IN_PROGRESS', 2500, 0, '26 km trip, patient stable.', { vehicle: 'Ambulance 01', driver: 'Driver Suresh', tripType: 'Emergency', km: 26, fare: 2500 }],
    ['ambulance', 'Vehicle Maintenance', 'Ambulance 01 — brake service', 'Ambulance 01', 'Transport', 'MEDIUM', 'PENDING', 4800, 0, 'Scheduled Friday.', { vehicle: 'Ambulance 01', tripType: 'Scheduled', fare: 0 }],
    ['ophthalmology', 'Item & Supplier Master', 'Add spectacle frame supplier', 'Vision Centre', 'Store Arjun', 'LOW', 'COMPLETED', 0, 1, 'Supplier enroled.', { supplier: 'Vision Centre', item: 'Progressive lens', itemType: 'Lens', qty: 1, value: 0 }],
    ['physiotherapy', 'Tracking of Physiotherapy Procedures', 'Knee rehab — session 8/12', 'Ramesh Babu', 'Physio dept', 'MEDIUM', 'IN_PROGRESS', 650, 1, 'Improvement noted.', { patient: 'Ramesh Babu', procedure: 'Therapeutic exercise', sittings: 8, charge: 650, improvement: 'Improving' }],
    ['admin', 'Mapping Hospital Processes', 'Process map — discharge workflow', 'Admin', 'System Admin', 'MEDIUM', 'IN_PROGRESS', 0, 0, 'Step 4 of 6 mapped.', { configArea: 'Process mapping', owner: 'System Admin', impact: 'Whole hospital' }],
    ['admin', 'Number Generation Configuration', 'Configure OPD number prefix', 'Admin', 'System Admin', 'LOW', 'COMPLETED', 0, 0, 'Prefix OP-YYMMDD.', { configArea: 'Numbering', owner: 'System Admin', impact: 'Whole hospital' }],
    ['bloodbank', 'Donor Registration', 'Blood donation enrolment', 'Volunteer donor', 'Blood bank', 'MEDIUM', 'PENDING', 0, 1, 'Screening pending.', { donor: 'Volunteer donor', bloodGroup: 'O+', component: 'Whole blood', units: 1, screening: 'Passed' }],
    ['bloodbank', 'Stock Maintenance', 'O+ packed cells stock', 'Blood bank', 'Lab Kavya', 'HIGH', 'COMPLETED', 0, 18, '18 units in store.', { donor: 'Blood bank', bloodGroup: 'O+', component: 'PRBC', units: 18, screening: 'Passed' }],
    ['assets', 'Asset Master Maintenance', 'Asset master — infusion pumps', 'Equipment store', 'Store Arjun', 'MEDIUM', 'IN_PROGRESS', 32000, 8, '8 pumps inventoried.', { asset: 'Infusion pump', category: 'Equipment', location: 'Equipment store', value: 32000 }],
    ['assets', 'Preventive and Corrective Maintenance', 'AMC — ICU ventilators', 'ICU', 'Biomedical', 'HIGH', 'PENDING', 0, 0, 'Quarterly AMC due.', { asset: 'ICU ventilator', category: 'Equipment', location: 'ICU', value: 0, amcDue: '2026-12-01' }],
    ['radiology', 'Scan / X-Ray Classification', 'Classify new DR unit', 'Radiology', 'Radiologist', 'LOW', 'COMPLETED', 0, 1, 'Classified as digital X-ray.', { patient: 'Radiology', modality: 'X-Ray', bodyPart: 'DR Unit' }],
    ['radiology', 'Scan / X-Ray Result Template', 'Template — chest PA', 'Radiology', 'Radiologist', 'MEDIUM', 'IN_PROGRESS', 0, 0, 'Draft v2.', { patient: 'Radiology', modality: 'X-Ray', bodyPart: 'Chest PA' }],
    ['multispeciality', 'Cardiology', 'Cardiology OPD referrals', 'OPD', 'Dr. Priya Nair', 'HIGH', 'IN_PROGRESS', 0, 3, '3 referrals pending.', { patient: 'OPD', speciality: 'Cardiology', referredBy: 'OPD desk', fee: 0 }],
    ['others', 'Complaints and Tracking', 'Lift no.2 not working', 'Facilities', 'HK supervisor', 'HIGH', 'IN_PROGRESS', 0, 0, 'AMC contractor notified.', { area: 'Complaints', requestor: 'Facilities', impact: 'High' }],
    ['others', 'Fleet Management', 'Fleet log — patient transport van', 'Transport', 'Transport', 'LOW', 'COMPLETED', 0, 1, 'Route logged.', { area: 'Fleet', requestor: 'Transport', impact: 'Low' }],
  ];
  let moduleRecordCount = 0;
  for (let i = 0; i < seedWorkspaces.length; i++) {
    const [m, workflow, title, reference, assignee, priority, status, amount, quantity, notes, data = {}] = seedWorkspaces[i];
    const recordNumber = `SEED-${prefixFor(m)}-${String(i + 1).padStart(3, '0')}`;
    await ModuleRecord.findOneAndUpdate(
      { recordNumber },
      {
        $set: {
          module: m,
          workflow,
          title,
          reference,
          assignee,
          priority,
          status,
          amount,
          quantity,
          notes,
          data,
          scheduledDate: new Date(),
          createdBy: superAdmin._id,
          hospitalId: hospital._id,
        },
      },
      { new: true, upsert: true },
    );
    moduleRecordCount++;
  }
  logger.info(`Module workspace records ready (${moduleRecordCount})`);

  logger.info('==== IPD DEMO ADMISSIONS ====');
  const ipdCount = await IpdAdmission.countDocuments();
  if (ipdCount === 0) {
    const consultDoc = await Doctor.findOne({ name: 'Dr. Ravi Kumar' });
    const cardioDoc = await Doctor.findOne({ name: 'Dr. Priya Nair' });
    const gwWard = await Ward.findOne({ name: 'General Ward A' });
    const icuWard = await Ward.findOne({ name: 'ICU' });
    const generalDepartment = await Department.findOne({ name: 'General Medicine' });
    const cardiologyDepartment = await Department.findOne({ name: 'Cardiology' });
    const year = new Date().getFullYear();
    const start = Date.now();
    const daysAgo = (n, h = 0) => new Date(start - n * 24 * 3600000 - h * 3600000);

    const admissionDefs = [
      {
        patient: patientIDs[0], type: 'EMERGENCY', priority: 'URGENT', department: generalDepartment._id, doctor: consultDoc._id,
        ward: gwWard, diagnosis: 'Acute gastroenteritis with dehydration', complaint: 'Vomiting, loose stools for 2 days, low urine output', status: 'ADMITTED',
        expected: daysAgo(-2), admittedAt: daysAgo(1, 4), clinical: true, meds: true, order: true,
      },
      {
        patient: patientIDs[2], type: 'EMERGENCY', priority: 'STAT', department: cardiologyDepartment._id, doctor: cardioDoc._id,
        ward: icuWard, diagnosis: 'Acute coronary syndrome', complaint: 'Chest pain radiating to left arm, diaphoresis', status: 'ADMITTED',
        expected: daysAgo(-5), admittedAt: daysAgo(0, 1), clinical: true, meds: true, order: true,
      },
      {
        patient: patientIDs[3], type: 'ELECTIVE', priority: 'ROUTINE', department: generalDepartment._id, doctor: consultDoc._id,
        ward: null, diagnosis: 'Cholelithiasis — awaiting surgery', complaint: 'Right upper quadrant pain after fatty meals', status: 'DISCHARGE_PLANNED',
        expected: daysAgo(-1), admittedAt: daysAgo(2, 3), clinical: false,
      },
      {
        patient: patientIDs[5], type: 'ELECTIVE', priority: 'ROUTINE', department: generalDepartment._id, doctor: consultDoc._id,
        ward: null, diagnosis: 'Pneumonia — admitted for observation', complaint: 'Fever, cough for 5 days', status: 'WAITING_FOR_BED',
        expected: null, admittedAt: null, clinical: false,
      },
      {
        patient: patientIDs[7], type: 'EMERGENCY', priority: 'URGENT', department: generalDepartment._id, doctor: consultDoc._id,
        ward: null, diagnosis: 'Viral fever, recovered', complaint: 'High grade fever, body ache', status: 'DISCHARGED',
        expected: null, admittedAt: daysAgo(5, 2), clinical: false,
      },
    ];

    for (const def of admissionDefs) {
      const admissionNumber = await generateNumber(NUMBER_PREFIXES.ADMISSION, year);
      let bed = null;
      let bedHistory = [];
      let admittedAt = def.admittedAt || undefined;
      if (def.ward && ['ADMITTED'].includes(def.status)) {
        bed = await Bed.findOne({ wardId: def.ward._id, status: 'AVAILABLE' });
        if (bed) {
          bed.status = 'OCCUPIED';
          bed.currentAdmissionId = null;
          await bed.save();
        }
      }
      const admission = await IpdAdmission.create({
        admissionNumber,
        patientId: def.patient,
        admissionType: def.type,
        priority: def.priority,
        departmentId: def.department,
        consultantDoctorId: def.doctor,
        admittingDoctor: def.doctor,
        admittingDiagnosis: def.diagnosis,
        chiefComplaint: def.complaint,
        provisionalDiagnosis: def.diagnosis,
        wardId: bed?.wardId,
        roomId: bed?.roomId,
        bedId: bed?._id,
        bedHistory,
        attendant: { name: 'Family', relation: 'Spouse', phone: '9810000111' },
        paymentCategory: def.patient === patientIDs[2] ? 'INSURANCE' : 'CASH',
        sponsor: def.patient === patientIDs[2] ? { name: 'ICICI Lombard', relation: 'Insurance', fundingLimit: 250000 } : undefined,
        estimatedStayDays: def.type === 'EMERGENCY' ? 3 : 5,
        expectedDischargeDate: def.expected,
        admittedAt,
        dischargedAt: def.status === 'DISCHARGED' ? daysAgo(2, 1) : undefined,
        status: def.status,
        notes: 'Seeded demo admission for IPD module.',
        admittedBy: superAdmin._id,
        hospitalId: hospital._id,
      });
      if (bed) {
        bed.currentAdmissionId = admission._id;
        await bed.save();
      }
      if (def.clinical && admittedAt) {
        await VitalRecord.create({
          patientId: def.patient, admissionId: admission._id, recordedAt: admittedAt, recordedBy: superAdmin._id,
          pulse: 96, bpSystolic: 120, bpDiastolic: 80, temperature: 99.2, spo2: 97, respiratoryRate: 18, weightKg: 68, source: 'NURSE', notes: 'Admission baseline',
        });
        await NursingNote.create({
          patientId: def.patient, admissionId: admission._id, recordedAt: admittedAt, recordedBy: superAdmin._id,
          shift: 'MORNING', noteType: 'DAILY_PROGRESS', note: 'Patient stable, tolerating oral fluids. Monitoring vitals.', vitals: { temperature: 99.1, pulse: 94, bpSystolic: 118, bpDiastolic: 78, respiratoryRate: 18, spo2: 98 },
        });
        await ClinicalNote.create({
          patientId: def.patient, admissionId: admission._id, createdBy: superAdmin._id,
          noteType: 'PLAN', body: `Admitted for ${def.diagnosis}. Plan: IVF for 24h, monitor vitals, review in morning round.`,
        });
      }
      if (def.meds) {
        await MedicationChart.create({
          patientId: def.patient, admissionId: admission._id, orderedBy: superAdmin._id,
          medicineName: 'Inj. Pantoprazole 40mg', dosage: '40mg', route: 'IV', frequency: 'OD', instructions: 'Before food',
          administrations: [{ scheduledTime: new Date(), givenTime: new Date(), status: 'GIVEN', administeredBy: superAdmin._id }],
        });
      }
      if (def.order) {
        await ClinicalOrder.create({
          patientId: def.patient, admissionId: admission._id, orderedBy: superAdmin._id,
          orderNumber: await generateNumber('ORD', year),
          name: def.patient === patientIDs[2] ? 'ECG + Troponin-I' : 'Complete Blood Count + RFT',
          category: def.patient === patientIDs[2] ? 'RADIOLOGY' : 'LAB',
          priority: def.priority, status: 'ORDERED', instructions: def.patient === patientIDs[2] ? 'Urgent — rule out MI' : 'Routine admission workup',
        });
      }
    }
    logger.info(`IPD demo admissions ready (${await IpdAdmission.countDocuments()})`);
  } else {
    logger.info(`IPD admissions already present (${ipdCount}) — skipped IPD seed`);
  }

  logger.info('==== SEED COMPLETE ====');
  logger.info('Demo logins:');
  logger.info(`superadmin / ${config.seed.adminPassword}  (Super Admin)`);
  logger.info('dr.ravi / Doctor@123   (Doctor)');
  logger.info('reception / Recep@123  (Receptionist)');
  logger.info('pharmacist / Pharm@123  (Pharmacist)');
  logger.info('labtech / Lab@123      (Lab Technician)');
  logger.info('billing / Bill@123     (Billing Staff)');
};

const run = async () => {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
    logger.info('MongoDB connected');
    await seed();
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    logger.error('Seed failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
};

run();