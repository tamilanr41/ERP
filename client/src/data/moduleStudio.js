// Per-module "studio" definition — turns the shared workspace scaffold into a
// domain-specific screen: custom fields, CTA copy and reference labels. Every
// value is stored in ModuleRecord.data on the backend.
export const STUDIO = {
  telehealth: {
    verb: 'Request teleconsult',
    newPlaceholder: 'e.g. Follow-up consult — fever & fatigue',
    referenceLabel: 'Patient',
    fields: [
      { name: 'patient', label: 'Patient', type: 'text', placeholder: 'Name + UHID', width: 'full', required: true },
      { name: 'consultType', label: 'Consult type', type: 'select', options: ['Video', 'Audio', 'Chat'], placeholder: 'Select type' },
      { name: 'durationMins', label: 'Duration (min)', type: 'number', placeholder: '30' },
      { name: 'fee', label: 'Fee (₹)', type: 'number', placeholder: '500' },
      { name: 'mode', label: 'Mode', type: 'select', options: ['Appointment', 'Urgent', 'Follow-up'] },
    ],
  },
  'patient-portal': {
    verb: 'New portal request',
    referenceLabel: 'Patient',
    fields: [
      { name: 'patient', label: 'Patient', type: 'text', placeholder: 'Name + UHID', width: 'full', required: true },
      { name: 'requestType', label: 'Request type', type: 'select', options: ['Registration', 'Appointment', 'Prescription', 'Reports', 'History'] },
      { name: 'priority', label: 'Priority', type: 'select', options: ['LOW', 'MEDIUM', 'HIGH'] },
    ],
  },
  opd: {
    verb: 'New OPD entry',
    referenceLabel: 'Patient',
    fields: [
      { name: 'patient', label: 'Patient', type: 'text', placeholder: 'Name + UHID', width: 'full', required: true },
      { name: 'doctor', label: 'Doctor', type: 'text', placeholder: 'Consulting doctor' },
      { name: 'visitType', label: 'Visit type', type: 'select', options: ['New', 'Follow-up', 'Referral', 'Walk-in'] },
      { name: 'fee', label: 'Consult fee (₹)', type: 'number' },
    ],
  },
  ipd: {
    verb: 'New admission entry',
    referenceLabel: 'Patient',
    fields: [
      { name: 'patient', label: 'Patient', type: 'text', placeholder: 'Name + UHID', width: 'full', required: true },
      { name: 'ward', label: 'Ward / Room', type: 'text', placeholder: 'e.g. General Ward A' },
      { name: 'admissionType', label: 'Admission type', type: 'select', options: ['Planned', 'Emergency', 'Transfer', 'Sponsor'] },
      { name: 'roomRate', label: 'Room rate/day (₹)', type: 'number' },
    ],
  },
  dialysis: {
    verb: 'Register dialysis sitting',
    referenceLabel: 'Patient',
    fields: [
      { name: 'patient', label: 'Patient', type: 'text', placeholder: 'Name + UHID', width: 'full', required: true },
      { name: 'sessionNo', label: 'Session no.', type: 'number', placeholder: '3' },
      { name: 'durationHrs', label: 'Duration (hrs)', type: 'number', placeholder: '4' },
      { name: 'nurse', label: 'Dialysis nurse', type: 'text' },
      { name: 'charges', label: 'Charges (₹)', type: 'number' },
      { name: 'outcome', label: 'Outcome', type: 'select', options: ['Smooth', 'Hypotension', 'Cramps', 'Completed'] },
    ],
  },
  multiward: {
    verb: 'New ward request',
    referenceLabel: 'Ward / Bed',
    fields: [
      { name: 'ward', label: 'Ward / Room', type: 'text', placeholder: 'e.g. WB-204', required: true },
      { name: 'bed', label: 'Bed', type: 'text', placeholder: 'e.g. B-2' },
      { name: 'serviceType', label: 'Service type', type: 'select', options: ['Nursing care', 'Pharmacy order', 'Radiology', 'Lab', 'Housekeeping', 'Diet'] },
      { name: 'patient', label: 'Patient', type: 'text' },
    ],
  },
  mrd: {
    verb: 'New MRD entry',
    referenceLabel: 'File / UHID',
    fields: [
      { name: 'uhid', label: 'Patient UHID', type: 'text', placeholder: 'ZMC-0000001', required: true },
      { name: 'fileType', label: 'File type', type: 'select', options: ['Case sheet', 'Bills', 'Reports', 'Documents', 'MLC'] },
      { name: 'location', label: 'Location', type: 'text', placeholder: 'e.g. Archive Rack 4' },
      { name: 'requestor', label: 'Requested by', type: 'text' },
    ],
  },
  theatre: {
    verb: 'Book theatre',
    referenceLabel: 'Patient',
    fields: [
      { name: 'patient', label: 'Patient', type: 'text', placeholder: 'Name + UHID', width: 'full', required: true },
      { name: 'procedure', label: 'Procedure', type: 'text', placeholder: 'e.g. Appendectomy', width: 'full', required: true },
      { name: 'theatre', label: 'Theatre', type: 'select', options: ['OT 1', 'OT 2', 'OT 3', 'Day care OT'] },
      { name: 'surgeon', label: 'Surgeon', type: 'text' },
      { name: 'anaesthetist', label: 'Anaesthetist', type: 'text' },
      { name: 'estCost', label: 'Est. cost (₹)', type: 'number' },
    ],
  },
  pharmacy: {
    verb: 'New pharmacy entry',
    referenceLabel: 'Medicine / Supplier',
    fields: [
      { name: 'item', label: 'Item', type: 'text', placeholder: 'Medicine / consumable', required: true },
      { name: 'supplier', label: 'Supplier', type: 'text' },
      { name: 'type', label: 'Type', type: 'select', options: ['Purchase', 'Sale', 'Return', 'Stock adjust'] },
      { name: 'qty', label: 'Qty', type: 'number' },
      { name: 'rate', label: 'Rate (₹)', type: 'number' },
    ],
  },
  lab: {
    verb: 'New lab entry',
    referenceLabel: 'Patient / Test',
    fields: [
      { name: 'test', label: 'Test / Profile', type: 'text', placeholder: 'e.g. CBC', required: true },
      { name: 'patient', label: 'Patient', type: 'text' },
      { name: 'sampleType', label: 'Sample', type: 'select', options: ['Whole Blood', 'Serum', 'Urine', 'Swab'] },
      { name: 'price', label: 'Price (₹)', type: 'number' },
    ],
  },
  cssd: {
    verb: 'New set entry',
    referenceLabel: 'Instrument set',
    fields: [
      { name: 'set', label: 'Instrument set', type: 'text', placeholder: 'e.g. Laparotomy set A-12', required: true },
      { name: 'method', label: 'Sterilisation', type: 'select', options: ['Autoclave', 'ETO', 'Chemical', 'Plasma'] },
      { name: 'cycleNo', label: 'Cycle no.', type: 'number' },
      { name: 'packs', label: 'Packs', type: 'number' },
      { name: 'stage', label: 'Stage', type: 'select', options: ['Received', 'Cleaned', 'Packed', 'Sterilised', 'Issued'] },
    ],
  },
  catering: {
    verb: 'New diet order',
    referenceLabel: 'Ward / Patient',
    fields: [
      { name: 'patient', label: 'Patient / Ward', type: 'text', required: true },
      { name: 'dietType', label: 'Diet type', type: 'select', options: ['Normal', 'Diabetic', 'Low Salt', 'High Protein', 'Soft', 'Liquid'] },
      { name: 'meals', label: 'Meals/day', type: 'number', placeholder: '3' },
      { name: 'days', label: 'Days', type: 'number', placeholder: '7' },
    ],
  },
  equipment: {
    verb: 'Add device record',
    referenceLabel: 'Device / Location',
    fields: [
      { name: 'device', label: 'Device', type: 'text', placeholder: 'e.g. Barcode printer', required: true },
      { name: 'category', label: 'Category', type: 'select', options: ['Bar code', 'Lab equipment', 'PACS', 'Biometric', 'ID printer'] },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'interface', label: 'Interface', type: 'select', options: ['TCP/IP', 'USB', 'RS-232', 'HL7'] },
    ],
  },
  housekeeping: {
    verb: 'New task',
    referenceLabel: 'Location',
    fields: [
      { name: 'location', label: 'Location', type: 'text', placeholder: 'e.g. Ward A / Room 204', required: true },
      { name: 'taskType', label: 'Task type', type: 'select', options: ['Linen issue', 'Linen return', 'Laundry', 'Cleaning', 'Maintenance', 'Complaint'] },
      { name: 'qty', label: 'Items', type: 'number' },
      { name: 'staff', label: 'Assigned to', type: 'text' },
    ],
  },
  purchase: {
    verb: 'New purchase',
    referenceLabel: 'Supplier',
    fields: [
      { name: 'supplier', label: 'Supplier', type: 'text', required: true },
      { name: 'item', label: 'Item', type: 'text', placeholder: 'e.g. Surgical gloves', required: true },
      { name: 'itemType', label: 'Item type', type: 'select', options: ['Medicine', 'Consumable', 'Equipment', 'General'] },
      { name: 'qty', label: 'Qty', type: 'number' },
      { name: 'unitCost', label: 'Unit cost (₹)', type: 'number' },
    ],
  },
  hrm: {
    verb: 'New HR entry',
    referenceLabel: 'Staff',
    fields: [
      { name: 'staff', label: 'Staff name', type: 'text', required: true },
      { name: 'role', label: 'Role', type: 'select', options: ['Doctor', 'Nurse', 'Technician', 'Admin', 'Housekeeping', 'Other'] },
      { name: 'department', label: 'Department', type: 'text' },
      { name: 'action', label: 'Action', type: 'select', options: ['Hire', 'Leave', 'Attendance', 'Loan', 'Salary', 'Payslip'] },
    ],
  },
  finance: {
    verb: 'New entry',
    referenceLabel: 'Account',
    fields: [
      { name: 'account', label: 'Account', type: 'select', options: ['Cash', 'Bank', 'Receivables', 'Payables', 'Revenue', 'Expense'], required: true },
      { name: 'entryType', label: 'Entry type', type: 'select', options: ['Debit', 'Credit'] },
      { name: 'amount', label: 'Amount (₹)', type: 'number', required: true },
      { name: 'period', label: 'Period', type: 'text', placeholder: 'e.g. Sep 2026' },
    ],
  },
  ticketing: {
    verb: 'Raise ticket',
    referenceLabel: 'Reported by',
    fields: [
      { name: 'reporter', label: 'Reported by', type: 'text' },
      { name: 'category', label: 'Category', type: 'select', options: ['IT support', 'Network', 'Hardware', 'Application', 'Facility'] },
      { name: 'urgency', label: 'Urgency', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'] },
      { name: 'location', label: 'Location', type: 'text' },
    ],
  },
  ambulance: {
    verb: 'New trip',
    referenceLabel: 'Vehicle',
    fields: [
      { name: 'vehicle', label: 'Vehicle', type: 'text', placeholder: 'e.g. Ambulance 01', required: true },
      { name: 'driver', label: 'Driver', type: 'text' },
      { name: 'tripType', label: 'Trip type', type: 'select', options: ['Emergency', 'Scheduled', 'Transfer', 'Intercity'] },
      { name: 'km', label: 'Distance (km)', type: 'number' },
      { name: 'fare', label: 'Fare (₹)', type: 'number' },
    ],
  },
  ophthalmology: {
    verb: 'New entry',
    referenceLabel: 'Supplier / Item',
    fields: [
      { name: 'supplier', label: 'Supplier', type: 'text' },
      { name: 'item', label: 'Item', type: 'text', placeholder: 'e.g. Progressive lens', required: true },
      { name: 'itemType', label: 'Item type', type: 'select', options: ['Frame', 'Lens', 'Contact lens', 'Accessory'] },
      { name: 'qty', label: 'Qty', type: 'number' },
      { name: 'value', label: 'Value (₹)', type: 'number' },
    ],
  },
  physiotherapy: {
    verb: 'New session',
    referenceLabel: 'Patient',
    fields: [
      { name: 'patient', label: 'Patient', type: 'text', required: true },
      { name: 'procedure', label: 'Procedure', type: 'select', options: ['Mobilisation', 'Ultrasound', 'Therapeutic exercise', 'Traction', 'TENS', 'Heat therapy'] },
      { name: 'sittings', label: 'No. of sittings', type: 'number' },
      { name: 'charge', label: 'Charge (₹)', type: 'number' },
      { name: 'improvement', label: 'Improvement', type: 'select', options: ['Not assessed', 'Improving', 'Static', 'Regressed'] },
    ],
  },
  admin: {
    verb: 'New config entry',
    referenceLabel: 'Owner',
    fields: [
      { name: 'configArea', label: 'Config area', type: 'select', options: ['Roles', 'Screen privileges', 'Role assignment', 'Numbering', 'Process mapping', 'Settings'] },
      { name: 'owner', label: 'Owner', type: 'text' },
      { name: 'impact', label: 'Impact', type: 'select', options: ['Whole hospital', 'Department', 'Single role'] },
    ],
  },
  bloodbank: {
    verb: 'New blood bank entry',
    referenceLabel: 'Donor',
    fields: [
      { name: 'donor', label: 'Donor', type: 'text', required: true },
      { name: 'bloodGroup', label: 'Blood group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      { name: 'component', label: 'Component', type: 'select', options: ['Whole blood', 'PRBC', 'FFP', 'Platelets', 'Cryoprecipitate'] },
      { name: 'units', label: 'Units', type: 'number' },
      { name: 'screening', label: 'Screening', type: 'select', options: ['Passed', 'Referred', 'Deferred'] },
    ],
  },
  assets: {
    verb: 'Add asset',
    referenceLabel: 'Asset / Location',
    fields: [
      { name: 'asset', label: 'Asset name', type: 'text', placeholder: 'e.g. Infusion pump #04', required: true },
      { name: 'category', label: 'Category', type: 'select', options: ['Equipment', 'Furniture', 'Vehicle', 'IT', 'Building'] },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'value', label: 'Value (₹)', type: 'number' },
      { name: 'amcDue', label: 'AMC due', type: 'date' },
    ],
  },
  radiology: {
    verb: 'New radiology entry',
    referenceLabel: 'Patient',
    fields: [
      { name: 'patient', label: 'Patient', type: 'text', required: true },
      { name: 'modality', label: 'Modality', type: 'select', options: ['X-Ray', 'USG', 'CT', 'MRI', 'Doppler'] },
      { name: 'bodyPart', label: 'Body part', type: 'text', placeholder: 'e.g. Chest PA' },
      { name: 'price', label: 'Price (₹)', type: 'number' },
    ],
  },
  multispeciality: {
    verb: 'New referral',
    referenceLabel: 'Patient',
    fields: [
      { name: 'patient', label: 'Patient', type: 'text', required: true },
      { name: 'speciality', label: 'Speciality', type: 'select', options: ['OBG', 'Paediatrics', 'Infertility', 'Dental', 'Ophthalmology', 'Diabetology', 'Urology', 'Cardiology', 'Orthopaedics', 'Dermatology'] },
      { name: 'referredBy', label: 'Referred by', type: 'text' },
      { name: 'fee', label: 'Fee (₹)', type: 'number' },
    ],
  },
  insurance: {
    verb: 'New insurance entry',
    referenceLabel: 'Patient / Policy',
    fields: [
      { name: 'policy', label: 'Policy no.', type: 'text' },
      { name: 'patient', label: 'Patient', type: 'text' },
      { name: 'type', label: 'Type', type: 'select', options: ['Provider', 'Policy', 'Pre-auth', 'Claim'] },
      { name: 'amount', label: 'Amount (₹)', type: 'number' },
    ],
  },
  billing: {
    verb: 'New billing entry',
    referenceLabel: 'Patient / Bill',
    fields: [
      { name: 'patient', label: 'Patient', type: 'text' },
      { name: 'type', label: 'Type', type: 'select', options: ['Room rent', 'Lab', 'Theatre', 'Implant', 'Pharmacy', 'Dialysis', 'Other'] },
      { name: 'amount', label: 'Amount (₹)', type: 'number' },
    ],
  },
  others: {
    verb: 'New entry',
    referenceLabel: 'Related to',
    fields: [
      { name: 'area', label: 'Area', type: 'select', options: ['Online appointment', 'Complaints', 'Fleet', 'MIS reports', 'SMS / Email', 'Alerts', 'Analytics'] },
      { name: 'requestor', label: 'Requestor', type: 'text' },
      { name: 'impact', label: 'Impact', type: 'select', options: ['Low', 'Medium', 'High'] },
    ],
  },
};

export const getStudio = (key) => STUDIO[key] || {};

export const columnEligible = (f) => !['textarea'].includes(f.type);

// Map a stored record back into editable form fields (data + legacy fields).
export const toForm = (record = {}, fields = []) => {
  const form = {
    title: record.title || '',
    reference: record.reference || '',
    assignee: record.assignee || '',
    priority: record.priority || 'MEDIUM',
    status: record.status || 'PENDING',
    scheduledDate: record.scheduledDate ? String(record.scheduledDate).slice(0, 10) : '',
    notes: record.notes || '',
  };
  for (const f of fields) form[f.name] = record.data?.[f.name] ?? '';
  return form;
};

export const collectData = (form, fields) => {
  const data = {};
  for (const f of fields) {
    const v = form[f.name];
    if (v === '' || v == null) continue;
    if (f.type === 'number') data[f.name] = Number(v);
    else if (f.type === 'date') data[f.name] = v;
    else data[f.name] = v;
  }
  return data;
};