import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongod;

before(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongod.getUri('hospital_erp_test');

  const { readdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const modelsDir = path.resolve(import.meta.dirname, '../src/models');
  for (const file of (await readdir(modelsDir)).filter((f) => f.endsWith('.js'))) {
    await import(pathToFileURL(path.join(modelsDir, file)).href);
  }

  const { connectDB, ensureCollections } = await import('../src/config/db.js');
  await connectDB();
  await ensureCollections();
  const { bootstrapRoles } = await import('../src/services/auth.service.js');
  await bootstrapRoles();
});

after(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  if (mongoose.connection.db) {
    for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});
  }
  // The wipe above also clears roles and permissions, and both are read by the
  // helpers below, so they are rebuilt per test rather than once at boot.
  const { bootstrapRoles } = await import('../src/services/auth.service.js');
  await bootstrapRoles();
});

const svc = () => import('../src/services/user.service.js');
const User = () => import('../src/models/User.model.js').then((m) => m.default);
const Role = () => import('../src/models/Role.model.js').then((m) => m.default);
const Permission = () => import('../src/models/Permission.model.js').then((m) => m.default);
const master = () => import('../src/services/master.service.js');
const pharmacy = () => import('../src/services/pharmacy.service.js');
const lab = () => import('../src/services/lab.service.js');

const actor = (overrides = {}) => ({
  id: new mongoose.Types.ObjectId(),
  hospitalId: new mongoose.Types.ObjectId(),
  roleCode: 'SUPER_ADMIN',
  permissions: ['*'],
  ...overrides,
});

const makeSuperAdmin = async (overrides = {}) => {
  const [UserM, role] = await Promise.all([User(), Role()]);
  const superRole = await role.findOne({ name: 'SUPER_ADMIN' });
  return UserM.create({
    username: overrides.username || `admin${Math.random().toString(36).slice(2, 8)}`,
    email: overrides.email || `admin${Math.random().toString(36).slice(2, 8)}@test.local`,
    passwordHash: 'Sup3rSecret!',
    role: superRole._id,
    roleCode: 'SUPER_ADMIN',
    firstName: 'Root',
    ...overrides,
  });
};

const makeUser = async (roleName = 'RECEPTIONIST', overrides = {}) => {
  const [UserM, role] = await Promise.all([User(), Role()]);
  const r = await role.findOne({ name: roleName });
  return UserM.create({
    username: overrides.username || `u${Math.random().toString(36).slice(2, 10)}`,
    email: overrides.email || `u${Math.random().toString(36).slice(2, 10)}@test.local`,
    passwordHash: 'Passw0rd!x',
    role: r._id,
    roleCode: roleName,
    firstName: 'Staff',
    ...overrides,
  });
};

// ===== permissions =====

test('settings: the permission codes the admin screens require actually exist', async () => {
  const P = await Permission();
  const codes = new Set((await P.find({}).lean()).map((p) => p.code));
  // Each of these was required by a route while never being granted to anyone,
  // so the screen behind it was reachable only through the SUPER_ADMIN bypass.
  for (const code of ['USER_VIEW', 'USER_CREATE', 'USER_EDIT', 'USER_DELETE', 'LAB_MANAGE', 'LAB_VIEW', 'SETTINGS_MANAGE', 'HOSPITAL_MANAGE']) {
    assert.ok(codes.has(code), `${code} must be a real permission row`);
  }
});

test('settings: hospital admin inherits the user and lab master-data permissions', async () => {
  const R = await Role();
  const admin = await R.findOne({ name: 'HOSPITAL_ADMIN' }).lean();
  assert.ok(admin.permissions.includes('USER_VIEW'), 'hospital admin must be able to open the users screen');
  assert.ok(admin.permissions.includes('USER_DELETE'));
  assert.ok(admin.permissions.includes('LAB_MANAGE'));
});

// ===== users =====

test('settings: a user account is deactivated, never removed from history', async () => {
  const { deleteUserService } = await svc();
  const UserM = await User();
  const target = await makeUser('RECEPTIONIST');

  const out = await deleteUserService(target._id, actor());

  assert.equal(out.active, false);
  assert.equal(out.status, 'INACTIVE');
  // The row survives, so bills and audit entries keep pointing at a real person.
  const stillThere = await UserM.findById(target._id);
  assert.ok(stillThere, 'the document must still exist');
  assert.equal(stillThere.active, false);
  assert.equal(stillThere.passwordHash, target.passwordHash, 'the hash is untouched, not blanked');
});

test('settings: deactivating an account invalidates its refresh tokens', async () => {
  const { deleteUserService } = await svc();
  const UserM = await User();
  const target = await makeUser('RECEPTIONIST');
  target.refreshTokens = ['live-token-a', 'live-token-b'];
  await target.save();

  await deleteUserService(target._id, actor());

  const after = await UserM.findById(target._id).select('+refreshTokens');
  assert.deepEqual(after.refreshTokens, [], 'a refresh token minted earlier must not survive');
});

test('settings: an admin cannot deactivate their own account', async () => {
  const { deleteUserService } = await svc();
  const me = await makeSuperAdmin();
  await assert.rejects(
    () => deleteUserService(me._id, actor({ id: me._id })),
    /cannot deactivate your own account/i,
  );
});

test('settings: the last active super admin is protected from being deactivated', async () => {
  const { deleteUserService } = await svc();
  const only = await makeSuperAdmin();
  await assert.rejects(
    () => deleteUserService(only._id, actor()),
    /last active super admin/i,
    'losing the only super admin locks everyone out with no way back',
  );
});

test('settings: the last super admin is protected from a password reset too', async () => {
  const { resetUserPasswordService } = await svc();
  const only = await makeSuperAdmin();
  await assert.rejects(() => resetUserPasswordService(only._id, 'BrandNew123', actor()), /last active super admin/i);
});

test('settings: a second super admin unlocks deactivating the first', async () => {
  const { deleteUserService } = await svc();
  const first = await makeSuperAdmin();
  await makeSuperAdmin();
  const out = await deleteUserService(first._id, actor());
  assert.equal(out.active, false);
});

test('settings: an admin password reset actually hashes the new password', async () => {
  const { resetUserPasswordService } = await svc();
  const UserM = await User();
  const target = await makeUser('NURSE');

  const out = await resetUserPasswordService(target._id, 'ResetMe123', actor());
  assert.ok(out.passwordChangedAt instanceof Date);

  // The pre('save') hook is what hashes. Had this gone through
  // findByIdAndUpdate the raw string would be stored and no one could ever log in.
  const stored = await UserM.findById(target._id).select('+passwordHash');
  assert.notEqual(stored.passwordHash, 'ResetMe123', 'the plaintext must not be what is stored');
  assert.equal(await stored.comparePassword('ResetMe123'), true, 'the new password must actually work');
});

test('settings: a password reset signs the user out everywhere', async () => {
  const { resetUserPasswordService } = await svc();
  const UserM = await User();
  const target = await makeUser('NURSE');
  target.refreshTokens = ['existing'];
  await target.save();

  await resetUserPasswordService(target._id, 'ResetMe123', actor());

  const after = await UserM.findById(target._id).select('+refreshTokens');
  assert.deepEqual(after.refreshTokens, []);
});

test('settings: an admin cannot reset their own password through this path', async () => {
  const { resetUserPasswordService } = await svc();
  const me = await makeSuperAdmin();
  await assert.rejects(() => resetUserPasswordService(me._id, 'ResetMe123', actor({ id: me._id })), /Change Password/i);
});

test('settings: a too-short admin password is refused before anything is written', async () => {
  const { resetUserPasswordService } = await svc();
  const target = await makeUser('NURSE');
  await assert.rejects(() => resetUserPasswordService(target._id, 'short', actor()), /at least 8/i);
  const UserM = await User();
  assert.equal(await (await UserM.findById(target._id)).comparePassword('Passw0rd!x'), true, 'old password still works');
});

// ===== hospital =====

test('settings: setting a status to INACTIVE also clears the active flag', async () => {
  const { setUserStatusService } = await svc();
  const UserM = await User();
  const target = await makeUser('NURSE');
  target.refreshTokens = ['live'];
  await target.save();

  const out = await setUserStatusService(target._id, 'INACTIVE', actor());

  // status and active are two fields for one fact. Writing only status left
  // rows claiming INACTIVE while active: true, so the person still appeared in
  // every "active users" listing.
  assert.equal(out.status, 'INACTIVE');
  assert.equal(out.active, false, 'the active flag must follow the status');

  const stored = await UserM.findById(target._id).select('+refreshTokens');
  assert.equal(stored.active, false, 'the flag must be persisted, not just returned');
  assert.deepEqual(stored.refreshTokens, [], 'a stood-down account must not keep live refresh tokens');
});

test('settings: reactivating a user restores the active flag and clears the lock', async () => {
  const { setUserStatusService } = await svc();
  const UserM = await User();
  const target = await makeUser('NURSE');
  target.active = false;
  target.status = 'INACTIVE';
  target.failedLoginAttempts = 6;
  target.lockUntil = new Date(Date.now() + 3600_000);
  await target.save();

  const out = await setUserStatusService(target._id, 'ACTIVE', actor());

  assert.equal(out.status, 'ACTIVE');
  assert.equal(out.active, true, 'reactivation must flip active back, otherwise login stays blocked forever');
  const stored = await UserM.findById(target._id);
  assert.equal(stored.failedLoginAttempts, 0);
  assert.equal(stored.lockUntil, undefined);
});

test('settings: the status route cannot sidestep the last-super-admin guard', async () => {
  const { setUserStatusService } = await svc();
  const only = await makeSuperAdmin();
  // deleteUserService refuses this, so the softer status route must too,
  // otherwise the last admin simply takes the other door out.
  await assert.rejects(
    () => setUserStatusService(only._id, 'INACTIVE', actor()),
    /last active super admin/i,
  );
});

test('settings: a user created from the settings form gets a real role ref', async () => {
  const { createUserService } = await import('../src/services/auth.service.js');
  const R = await Role();
  const nurse = await R.findOne({ name: 'NURSE' });
  const boss = actor();

  // The form and the validator both speak roleId, but the schema field is
  // `role`. createUserService used to destructure roleId away and never assign
  // role, so every create died on "Path `role` is required" and the New User
  // screen could not work at all.
  const user = await createUserService(
    {
      username: 'role_probe',
      email: 'role_probe@test.local',
      password: 'ProbePass123',
      firstName: 'Role',
      lastName: 'Probe',
      roleId: nurse._id,
    },
    boss,
  );

  assert.ok(user.role, 'the role ref must be set');
  assert.equal(user.role.toString(), nurse._id.toString());
  assert.equal(user.roleCode, 'NURSE', 'roleCode must be derived so permission checks can read it');

  const [UserM] = await Promise.all([User()]);
  const stored = await UserM.findById(user._id).lean();
  assert.equal(stored.role.toString(), nurse._id.toString(), 'it has to survive the write, not just the return value');
});

test('settings: reassigning a role actually moves the user to that role', async () => {
  const { updateUserService } = await svc();
  const R = await Role();
  const target = await makeUser('NURSE');
  const doctor = await R.findOne({ name: 'DOCTOR' });

  const out = await updateUserService(target._id, { roleId: doctor._id }, actor());

  // Writing roleId straight into the document was dropped by Mongoose's strict
  // mode, so the edit reported success and left the person as a nurse.
  assert.equal(out.role?._id?.toString?.() ?? out.role?.toString?.(), doctor._id.toString());
  assert.equal(out.roleCode, 'DOCTOR');

  const [UserM] = await Promise.all([User()]);
  const stored = await UserM.findById(target._id).lean();
  assert.equal(stored.role.toString(), doctor._id.toString(), 'the change must be persisted on the role ref itself');
});

test('settings: the hospital save cannot rewrite its identity or tenancy keys', async () => {
  const { createHospital, updateHospital } = await master();
  const H = () => import('../src/models/Hospital.model.js').then((m) => m.default);
  const orgId = new mongoose.Types.ObjectId();
  const h = await createHospital({ name: 'Original Name', code: 'ORIG', organizationId: orgId });

  await updateHospital(h._id, {
    name: 'Renamed Hospital',
    organizationId: new mongoose.Types.ObjectId(),
    code: 'HIJACK',
    active: false,
    logo: '/uploads/hospital/logo.png',
  });

  const after = await (await H()).findById(h._id).lean();
  assert.equal(after.name, 'Renamed Hospital', 'editable fields do save');
  assert.equal(after.logo, '/uploads/hospital/logo.png', 'the logo does save');
  assert.equal(after.code, 'ORIG', 'code is the key other documents are filed under - it must not move');
  assert.equal(String(after.organizationId), String(orgId), 'tenant ownership must not be reassignable from a settings form');
  assert.equal(after.active, true);
});

test('settings: saving one tax field does not blank out the rest of the tax block', async () => {
  const { createHospital, updateHospital } = await master();
  const H = () => import('../src/models/Hospital.model.js').then((m) => m.default);
  const h = await createHospital({ name: 'Tax Test', code: 'TAX1', tax: { currency: 'INR', currencySymbol: '₹', defaultGstPct: 18 } });

  await updateHospital(h._id, { tax: { defaultGstPct: 5 } });

  const after = await (await H()).findById(h._id).lean();
  assert.equal(after.tax.defaultGstPct, 5, 'the field being edited changed');
  assert.equal(after.tax.currency, 'INR', 'a sibling field sent nowhere must survive');
  assert.equal(after.tax.currencySymbol, '₹');
});

// ===== medicines =====

test('settings: retiring a medicine keeps the document for past bills', async () => {
  const { createMedicine, deleteMedicine } = await pharmacy();
  const M = () => import('../src/models/Medicine.model.js').then((m) => m.default);
  const med = await createMedicine({ name: 'Paracetamol 500' });

  const out = await deleteMedicine(med._id);

  assert.equal(out.isActive, false);
  const stillThere = await (await M()).findById(med._id);
  assert.ok(stillThere, 'a dispensed medicine must not vanish from a signed-off bill');
});

test('settings: deleting a category still in use is refused', async () => {
  const { createCategory, createMedicine, deleteCategory } = await pharmacy();
  const cat = await createCategory({ name: 'Analgesics' });
  await createMedicine({ name: 'Ibuprofen', category: cat._id });

  await assert.rejects(() => deleteCategory(cat._id), /still use this category/i);
});

test('settings: a category becomes deletable once nothing active uses it', async () => {
  const { createCategory, createMedicine, deleteCategory, deleteMedicine } = await pharmacy();
  const C = () => import('../src/models/Medicine.model.js').then((m) => m.MedicineCategory);
  const cat = await createCategory({ name: 'Analgesics' });
  const med = await createMedicine({ name: 'Ibuprofen', category: cat._id });

  await deleteMedicine(med._id);
  const out = await deleteCategory(cat._id);

  assert.equal(out._id.toString(), cat._id.toString());
  assert.equal(await (await C()).findById(cat._id), null);
});

test('settings: deleting a manufacturer still in use is refused', async () => {
  const { createManufacturer, createMedicine, deleteManufacturer } = await pharmacy();
  const m = await createManufacturer({ name: 'Cipla' });
  await createMedicine({ name: 'Azithral', manufacturer: m._id });
  await assert.rejects(() => deleteManufacturer(m._id), /still use this manufacturer/i);
});

test('settings: renaming a category keeps its medicines attached', async () => {
  const { createCategory, createMedicine, updateCategory } = await pharmacy();
  const cat = await createCategory({ name: 'Old Name' });
  const med = await createMedicine({ name: 'Attached', category: cat._id });

  await updateCategory(cat._id, { name: 'New Name' });

  const stored = await (await import('../src/models/Medicine.model.js')).default.findById(med._id).lean();
  assert.equal(stored.category.toString(), cat._id.toString(), 'renaming must not detach the medicine');
});

test('settings: a medicine update cannot smuggle in fields outside the whitelist', async () => {
  const { createMedicine, updateMedicine } = await pharmacy();
  const med = await createMedicine({ name: 'Whitelist Test' });
  await updateMedicine(med._id, { name: 'Renamed', isActive: false, _id: '000000000000000000000000' });
  const after = await (await import('../src/models/Medicine.model.js')).default.findById(med._id).lean();
  assert.equal(after.name, 'Renamed');
  assert.equal(after._id.toString(), med._id.toString(), 'the id must never be overwritable');
});

// ===== lab tests =====

test('settings: retiring a lab test keeps its normal ranges for released reports', async () => {
  const { createLabTest, deleteLabTest } = await lab();
  const L = () => import('../src/models/LabTest.model.js').then((m) => m.default);
  const test = await createLabTest({ name: 'Complete Blood Count', price: 350, parameters: [{ name: 'Haemoglobin', unit: 'g/dL', normalRange: '12-15' }] });

  const out = await deleteLabTest(test._id);

  assert.equal(out.active, false);
  const stillThere = await (await L()).findById(test._id);
  assert.ok(stillThere, 'a released report must keep resolving to its test');
  assert.equal(stillThere.parameters[0].normalRange, '12-15');
});

test('settings: lab categories can be created, renamed and deleted', async () => {
  const { createLabCategory, updateLabCategory, deleteLabCategory, listLabCategories } = await lab();
  const C = () => import('../src/models/LabTest.model.js').then((m) => m.LabCategory);
  const cat = await createLabCategory({ name: 'Haematology' });
  assert.equal((await listLabCategories()).length, 1);

  await updateLabCategory(cat._id, { name: 'Haematology & Coagulation' });
  assert.equal((await (await C()).findById(cat._id)).name, 'Haematology & Coagulation');

  await deleteLabCategory(cat._id);
  assert.equal(await (await C()).findById(cat._id), null);
});

test('settings: a lab category in use cannot be renamed or deleted', async () => {
  const { createLabCategory, createLabTest, updateLabCategory, deleteLabCategory } = await lab();
  const cat = await createLabCategory({ name: 'Biochemistry' });
  await createLabTest({ name: 'LFT', category: cat._id });

  await assert.rejects(() => deleteLabCategory(cat._id), /still use this category/i);
  await assert.rejects(() => updateLabCategory(cat._id, { name: 'Renamed' }), /still use this category/i);
});

test('settings: a lab test update cannot set fields outside the whitelist', async () => {
  const { createLabTest, updateLabTest } = await lab();
  const test = await createLabTest({ name: 'RFT', price: 200 });
  await updateLabTest(test._id, { price: 250, hospitalId: '000000000000000000000000' });
  const after = await (await import('../src/models/LabTest.model.js')).default.findById(test._id).lean();
  assert.equal(after.price, 250);
  assert.equal(after.hospitalId, undefined, 'tenant must not be settable from the master-data form');
});

test('settings: a lab test can be reactivated after being retired', async () => {
  const { createLabTest, deleteLabTest, updateLabTest } = await lab();
  const test = await createLabTest({ name: 'Reactivatable' });
  await deleteLabTest(test._id);
  const back = await updateLabTest(test._id, { active: true });
  assert.equal(back.active, true);
});