import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  module: { type: String, required: true },
  description: { type: String },
  active: { type: Boolean, default: true },
});

permissionSchema.statics.ensureDefaults = async function () {
  const defaults = [
    // Patients
    ['PATIENT_VIEW', 'patient', 'View patients'],
    ['PATIENT_CREATE', 'patient', 'Register patients'],
    ['PATIENT_EDIT', 'patient', 'Edit patients'],
    ['PATIENT_DELETE', 'patient', 'Delete patients'],
    ['PATIENT_MERGE', 'patient', 'Merge patient records'],
    ['PATIENT_DOCUMENT_UPLOAD', 'patient', 'Upload patient documents'],
    ['PATIENT_TIMELINE_VIEW', 'patient', 'View patient timeline'],
    // Appointments / OPD
    ['APPOINTMENT_VIEW', 'appointment', 'View appointments'],
    ['APPOINTMENT_CREATE', 'appointment', 'Book appointments'],
    ['APPOINTMENT_EDIT', 'appointment', 'Edit appointments'],
    ['APPOINTMENT_CANCEL', 'appointment', 'Cancel appointments'],
    ['OPD_VIEW', 'opd', 'View OPD visits'],
    ['OPD_CREATE', 'opd', 'Create OPD visit'],
    ['OPD_EDIT', 'opd', 'Edit OPD visit'],
    ['VITALS_CREATE', 'opd', 'Record vitals'],
    ['PRESCRIPTION_CREATE', 'opd', 'Create prescriptions'],
    ['PRESCRIPTION_VIEW', 'opd', 'View prescriptions'],
    ['DOCTOR_ORDER_CREATE', 'opd', 'Create doctor orders (lab/radiology)'],
    // IPD
    ['IPD_VIEW', 'ipd', 'View IPD admissions'],
    ['IPD_ADMIT', 'ipd', 'Admit patients'],
    ['IPD_DISCHARGE', 'ipd', 'Discharge patients'],
    ['IPD_TRANSFER', 'ipd', 'Transfer beds'],
    ['BED_VIEW', 'ipd', 'View bed map'],
    ['BED_MANAGE', 'ipd', 'Manage beds'],
    ['NURSING_RECORD', 'ipd', 'Record nursing care (MAR, I/O chart, nursing notes)'],
    ['IPD_CLINICAL_RECORD', 'ipd', 'Write IPD clinical records (notes, orders, medications, visits)'],
    ['IPD_MEDICATION_ISSUE', 'ipd', 'Verify / issue / return ward medication'],
    ['IPD_INSURANCE_LINK', 'ipd', 'Link insurance, TPA or sponsor to an admission'],
    ['IPD_BILLING', 'ipd', 'Run IPD billing, advances and final settlement'],
    ['IPD_DISCHARGE_BILLING', 'ipd', 'Complete discharge settlement workflow'],
    ['ADVANCE_COLLECT', 'ipd', 'Collect admission advances'],
    ['IPD_DOCUMENT_UPLOAD', 'ipd', 'Upload IPD documents'],
    ['IPD_TRANSFER_REQUEST', 'ipd', 'Request patient transfer'],
    ['IPD_REPORT_VIEW', 'ipd', 'View IPD reporting centre'],
    ['IPD_REPORT_EXPORT', 'ipd', 'Export IPD reports (PDF/Excel/CSV)'],
    // Dialysis
    ['DIALYSIS_VIEW', 'dialysis', 'View dialysis patients, sessions and machines'],
    ['DIALYSIS_REGISTER', 'dialysis', 'Register a patient for dialysis'],
    ['DIALYSIS_SCHEDULE', 'dialysis', 'Schedule and cancel dialysis sessions'],
    ['DIALYSIS_SESSION_RUN', 'dialysis', 'Run a dialysis session (check-in, connect, monitor, complete)'],
    ['DIALYSIS_PRESCRIBE', 'dialysis', 'Write dialysis prescriptions (nephrologist)'],
    ['DIALYSIS_BILLING', 'dialysis', 'Bill dialysis sessions and collect payment'],
    ['DIALYSIS_MACHINE_MANAGE', 'dialysis', 'Manage dialysis machines, stations and maintenance'],
    // Separate from machine management on purpose: the dialysis configuration
    // holds the clinical safety gates (pre-assessment requirement, post-dialysis
    // observations, expiry blocking, override policy). An equipment admin must
    // not be able to switch those off.
    ['DIALYSIS_CLINICAL_CONFIG', 'dialysis', 'Change dialysis clinical safety configuration and override policy'],
    ['DIALYSIS_SESSION_OVERRIDE', 'dialysis', 'Supervisor authority to override a failed dialysis safety check'],
    ['DIALYSIS_REPORT_VIEW', 'dialysis', 'View dialysis reports'],
    ['DIALYSIS_REPORT_EXPORT', 'dialysis', 'Export dialysis reports (PDF/Excel/CSV)'],
    // Emergency
    ['EMERGENCY_VIEW', 'emergency', 'View emergency'],
    ['EMERGENCY_CREATE', 'emergency', 'Register emergency'],
    ['TRIAGE_CREATE', 'emergency', 'Perform triage'],
    // Pharmacy
    ['PHARMACY_VIEW', 'pharmacy', 'View pharmacy'],
    ['PHARMACY_SALE', 'pharmacy', 'Create pharmacy sales'],
    ['PHARMACY_PURCHASE', 'pharmacy', 'Create pharmacy purchases'],
    ['PHARMACY_RETURN', 'pharmacy', 'Process pharmacy returns'],
    ['PHARMACY_STOCK_ADJUST', 'pharmacy', 'Adjust pharmacy stock'],
    ['PHARMACY_DISPENSE', 'pharmacy', 'Dispense prescriptions'],
    // Laboratory
    ['LAB_VIEW', 'lab', 'View lab'],
    ['LAB_ORDER_CREATE', 'lab', 'Create lab orders'],
    ['LAB_RESULT_ENTER', 'lab', 'Enter lab results'],
    ['LAB_RESULT_VERIFY', 'lab', 'Verify lab results'],
    ['LAB_SAMPLE', 'lab', 'Manage lab samples'],
    // Radiology
    ['RADIOLOGY_VIEW', 'radiology', 'View radiology'],
    ['RADIOLOGY_ORDER_CREATE', 'radiology', 'Create radiology orders'],
    ['RADIOLOGY_REPORT', 'radiology', 'Enter radiology reports'],
    ['RADIOLOGY_VERIFY', 'radiology', 'Verify radiology reports'],
    // OT
    ['OT_VIEW', 'ot', 'View OT'],
    ['OT_BOOK', 'ot', 'Book surgeries'],
    ['OT_MANAGE', 'ot', 'Manage OT operations'],
    // Billing
    ['BILLING_VIEW', 'billing', 'View bills'],
    ['BILLING_CREATE', 'billing', 'Create bills'],
    ['BILLING_EXECUTE', 'billing', 'Execute billable services'],
    ['BILLING_REFUND', 'billing', 'Process refunds'],
    ['PAYMENT_CREATE', 'billing', 'Record payments'],
    ['PAYMENT_VIEW', 'billing', 'View payments'],
    // Insurance
    ['INSURANCE_VIEW', 'insurance', 'View insurance'],
    ['INSURANCE_CLAIM_CREATE', 'insurance', 'Create claims'],
    ['INSURANCE_CLAIM_MANAGE', 'insurance', 'Manage claims'],
    ['INSURANCE_PREAUTH', 'insurance', 'Request / decide pre-authorizations'],
    ['INSURANCE_SETTLE', 'insurance', 'Settle claims'],
    // Inventory
    ['INVENTORY_VIEW', 'inventory', 'View inventory'],
    ['INVENTORY_MANAGE', 'inventory', 'Manage inventory'],
    ['SUPPLIER_MANAGE', 'inventory', 'Manage suppliers'],
    // HR
    ['EMPLOYEE_VIEW', 'hr', 'View employees'],
    ['EMPLOYEE_CREATE', 'hr', 'Create employees'],
    ['EMPLOYEE_EDIT', 'hr', 'Edit employees'],
    ['PAYROLL_MANAGE', 'hr', 'Manage payroll'],
    // Finance
    ['FINANCE_VIEW', 'finance', 'View finance'],
    ['EXPENSE_CREATE', 'finance', 'Create expenses'],
    // Users / Roles
    ['USER_CREATE', 'admin', 'Create users'],
    ['USER_EDIT', 'admin', 'Edit users'],
    ['USER_DELETE', 'admin', 'Delete users'],
    ['ROLE_MANAGE', 'admin', 'Manage roles'],
    ['HOSPITAL_MANAGE', 'admin', 'Manage hospital settings'],
    ['SETTINGS_MANAGE', 'admin', 'Manage settings'],
    // Reports / audit
    ['REPORT_VIEW', 'reports', 'View reports'],
    ['REPORT_EXPORT', 'reports', 'Export reports'],
    ['AUDIT_VIEW', 'reports', 'View audit logs'],
    ['DASHBOARD_VIEW', 'dashboard', 'View dashboard'],
    ['NOTIFICATION_VIEW', 'system', 'View notifications'],
    // Blood bank
    ['BLOOD_MANAGE', 'bloodbank', 'Manage blood bank'],
    // Telemedicine / teleconsultation
    ['TELEMEDICINE_VIEW', 'telemedicine', 'View teleconsultation appointments and rooms'],
    // Held by the PATIENT role. It grants nothing on its own — joining is
    // authorised by ownership of the appointment, and this only lets the route
    // through to the service that performs that check.
    ['TELEMEDICINE_JOIN_OWN', 'telemedicine', 'Join a teleconsultation you are the patient for'],
    // Kept apart from TELEMEDICINE_VIEW on purpose: booking a consultation is a
    // clinical act that commits a doctor and a fee, not a read of the schedule.
    ['TELEMEDICINE_BOOK', 'telemedicine', 'Book teleconsultation appointments'],
    ['TELEMEDICINE_EDIT', 'telemedicine', 'Reschedule or cancel teleconsultation appointments'],
    // Starting, ending and writing clinical notes during a live consultation.
    ['TELEMEDICINE_CONSULT', 'telemedicine', 'Start and end teleconsultations and record clinical findings'],
    // A patient joining their own room has no staff role and no permission row at
    // all, so this exists to describe staff-side entry to a specific room.
    ['TELEMEDICINE_JOIN_ANY', 'telemedicine', 'Join any teleconsultation room (supervisor / observer)'],
    ['TELEMEDICINE_BILLING', 'telemedicine', 'Generate and settle teleconsultation bills'],
    // Separate from billing: waiving money is a supervisor decision and must be
    // auditable on its own, not something a billing clerk inherits.
    ['TELEMEDICINE_FEE_WAIVE', 'telemedicine', 'Waive a teleconsultation fee'],
    ['TELEMEDICINE_RECORD_VIEW', 'telemedicine', 'View teleconsultation audit records'],
  ];

  for (const [code, module, description] of defaults) {
    await this.updateOne(
      { code },
      { $setOnInsert: { code, module, description } },
      { upsert: true },
    );
  }
};

const Permission = mongoose.model('Permission', permissionSchema);
export default Permission;