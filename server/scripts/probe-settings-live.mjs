/**
 * Live HTTP probe for the Settings admin module.
 *
 * The unit suite calls services directly, which proves the logic but not the
 * wiring: validators, permission middleware, controller error mapping and route
 * mounting are all bypassed. This walks the real routes over HTTP as a logged-in
 * SUPER_ADMIN so a green service test cannot hide a 404 or a 500.
 *
 * Usage: node scripts/probe-settings-live.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:5000';

let pass = 0;
const failures = [];

const check = (name, condition, detail = '') => {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
};

const call = async (method, path, { token, body, raw } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !raw) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, body: json };
};

// A throwaway suffix so re-running never collides with the previous run's data.
const RUN = Date.now().toString(36);
const stamp = (s) => `${s}_${RUN}`;

const main = async () => {
  console.log(`\n=== Settings live probe against ${BASE} ===`);

  // ---- auth -------------------------------------------------------------
  console.log('\n[auth]');
  const login = await call('POST', '/api/auth/login', {
    body: { usernameOrEmail: 'superadmin', password: process.env.SEED_ADMIN_PASSWORD || 'Admin@123' },
  });
  check('login succeeds', login.status === 200 && login.body?.data?.accessToken, `status=${login.status} ${JSON.stringify(login.body)}`);
  if (login.status !== 200) throw new Error('cannot continue without a token');

  const token = login.body.data.accessToken;
  const me = login.body.data.user;

  check('unauthenticated user list is refused', (await call('GET', '/api/users')).status === 401);
  check('tampered token is refused', (await call('GET', '/api/users', { token: `${token}tampered` })).status === 401);

  // ---- hospital ---------------------------------------------------------
  // The hospital profile is a singleton: PUT /hospital takes no id.
  console.log('\n[hospital]');
  const hosp = await call('GET', '/api/masters/hospital', { token });
  check('hospital profile loads', hosp.status === 200 && !!hosp.body?.data?._id, `status=${hosp.status}`);
  const before = hosp.body?.data ?? {};
  const beforeTax = before.tax ?? {};
  const beforeOrg = String(before.organizationId);

  const patch = await call('PUT', '/api/masters/hospital', {
    token,
    body: { name: before.name, tax: { defaultGstPct: 12 } },
  });
  check('hospital tax edit saves', patch.status === 200 && patch.body?.data?.tax?.defaultGstPct === 12,
    `status=${patch.status} tax=${JSON.stringify(patch.body?.data?.tax)}`);

  const keptSiblings = Object.keys(beforeTax)
    .filter((k) => k !== 'defaultGstPct')
    .every((k) => patch.body?.data?.tax?.[k] === beforeTax[k]);
  check('unrelated tax fields survive a partial save', keptSiblings,
    `before=${JSON.stringify(beforeTax)} after=${JSON.stringify(patch.body?.data?.tax)}`);

  const escalate = await call('PUT', '/api/masters/hospital', {
    token,
    body: { name: before.name, organizationId: '000000000000000000000000', active: false, code: 'HIJACKED' },
  });
  check('hospital save cannot rewrite tenancy keys', escalate.status === 200
    && String(escalate.body?.data?.organizationId) === beforeOrg
    && escalate.body?.data?.code === before.code
    && escalate.body?.data?.active === before.active,
  `status=${escalate.status} code=${escalate.body?.data?.code} org=${escalate.body?.data?.organizationId}`);

  const badPhone = await call('PUT', '/api/masters/hospital', { token, body: { name: before.name, phone: 'abc' } });
  check('invalid phone is rejected by the validator', badPhone.status === 400, `status=${badPhone.status}`);

  // ---- hospital logo ----------------------------------------------------
  console.log('\n[hospital logo]');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'logo.png');
  const upload = await call('POST', '/api/masters/hospital/logo', { token, body: form, raw: true });
  check('logo upload accepts an image', upload.status === 200 && !!upload.body?.data?.logo,
    `status=${upload.status} ${JSON.stringify(upload.body)}`);

  const textForm = new FormData();
  textForm.append('file', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'evil.txt');
  check('logo upload rejects a non-image',
    (await call('POST', '/api/masters/hospital/logo', { token, body: textForm, raw: true })).status >= 400);

  check('logo can be removed',
    (await call('DELETE', '/api/masters/hospital/logo', { token })).status === 200);

  // ---- users ------------------------------------------------------------
  console.log('\n[users]');
  const roles = await call('GET', '/api/users/roles', { token });
  check('role list loads', roles.status === 200 && Array.isArray(roles.body?.data), `status=${roles.status}`);
  const nurseRole = (roles.body?.data ?? []).find((r) => r.name === 'NURSE' || r.code === 'NURSE');
  check('a NURSE role exists to assign', !!nurseRole, `roles=${(roles.body?.data ?? []).map((r) => r.name).join(',')}`);

  const username = stamp('probe_nurse');
  const created = await call('POST', '/api/users', {
    token,
    body: {
      username,
      email: `${stamp('probe')}@test.local`,
      password: 'ProbePass123',
      firstName: 'Probe',
      lastName: 'Nurse',
      roleId: nurseRole?._id,
    },
  });
  check('user can be created', created.status === 201 && !!created.body?.data?._id,
    `status=${created.status} ${JSON.stringify(created.body)}`);
  const userId = created.body?.data?._id;

  const noRole = await call('POST', '/api/users', {
    token,
    body: { username: stamp('probe_x'), email: `${stamp('probe_y')}@test.local`, password: 'ProbePass123', roleId: '000000000000000000000000' },
  });
  check('creating a user without a valid role is refused', noRole.status >= 400, `status=${noRole.status}`);

  check('duplicate username is rejected', (await call('POST', '/api/users', {
    token,
    body: { username, email: `${stamp('probe_z')}@test.local`, password: 'ProbePass123', roleId: nurseRole?._id },
  })).status >= 400);

  const edited = await call('PUT', `/api/users/${userId}`, { token, body: { firstName: 'Renamed' } });
  check('user can be renamed', edited.status === 200 && edited.body?.data?.firstName === 'Renamed',
    `status=${edited.status} ${JSON.stringify(edited.body)}`);

  check('short password is rejected at the validator',
    (await call('PATCH', `/api/users/${userId}/password`, { token, body: { newPassword: 'abc' } })).status === 400);

  const reset = await call('PATCH', `/api/users/${userId}/password`, { token, body: { newPassword: 'ResetPass123' } });
  check('admin password reset succeeds', reset.status === 200, `status=${reset.status} ${JSON.stringify(reset.body)}`);

  check('the reset password actually logs in',
    (await call('POST', '/api/auth/login', { body: { usernameOrEmail: username, password: 'ResetPass123' } })).status === 200);

  const oldPw = await call('POST', '/api/auth/login', { body: { usernameOrEmail: username, password: 'ProbePass123' } });
  check('the old password no longer works', oldPw.status >= 400, `status=${oldPw.status}`);

  check('admin cannot reset their own password through this path',
    (await call('PATCH', `/api/users/${me._id}/password`, { token, body: { newPassword: 'ShouldNotWork1' } })).status >= 400);
  check('admin cannot deactivate themselves',
    (await call('DELETE', `/api/users/${me._id}`, { token })).status >= 400);

  const inactive = await call('PATCH', `/api/users/${userId}/status`, { token, body: { status: 'INACTIVE' } });
  check('user status can be set to INACTIVE', inactive.status === 200 && inactive.body?.data?.status === 'INACTIVE',
    `status=${inactive.status} ${JSON.stringify(inactive.body?.data)}`);

  const gone = await call('POST', '/api/auth/login', { body: { usernameOrEmail: username, password: 'ResetPass123' } });
  check('an inactive user cannot log in', gone.status >= 400, `status=${gone.status}`);

  const soft = await call('GET', `/api/users/${userId}`, { token });
  check('a deactivated user is retained, not erased', soft.status === 200 && soft.body?.data?.active === false,
    `status=${soft.status}`);

  // ---- medicines --------------------------------------------------------
  console.log('\n[medicines]');
  const cat = await call('POST', '/api/pharmacy/categories', { token, body: { name: stamp('Probe Cat') } });
  check('medicine category can be created', cat.status === 201 && !!cat.body?.data?._id,
    `status=${cat.status} ${JSON.stringify(cat.body)}`);
  const catId = cat.body?.data?._id;

  const manu = await call('POST', '/api/pharmacy/manufacturers', { token, body: { name: stamp('Probe Manu') } });
  check('manufacturer can be created', manu.status === 201 && !!manu.body?.data?._id,
    `status=${manu.status} ${JSON.stringify(manu.body)}`);
  const manuId = manu.body?.data?._id;

  const med = await call('POST', '/api/pharmacy/medicines', {
    token,
    body: { name: stamp('Probe Med'), unit: 'TABLET', packSize: 10, category: catId, manufacturer: manuId, gstPct: 12 },
  });
  check('medicine can be created', med.status === 201 && !!med.body?.data?._id,
    `status=${med.status} ${JSON.stringify(med.body)}`);
  const medId = med.body?.data?._id;

  const medEdit = await call('PUT', `/api/pharmacy/medicines/${medId}`, { token, body: { name: stamp('Probe Med 2') } });
  check('medicine can be renamed', medEdit.status === 200 && medEdit.body?.data?.name !== med.body?.data?.name,
    `status=${medEdit.status}`);

  check('category in use cannot be deleted',
    (await call('DELETE', `/api/pharmacy/categories/${catId}`, { token })).status >= 400);
  check('manufacturer in use cannot be deleted',
    (await call('DELETE', `/api/pharmacy/manufacturers/${manuId}`, { token })).status >= 400);

  const retireMed = await call('DELETE', `/api/pharmacy/medicines/${medId}`, { token });
  check('medicine can be retired', retireMed.status === 200 && retireMed.body?.data?.isActive === false,
    `status=${retireMed.status} ${JSON.stringify(retireMed.body?.data)}`);

  check('category is deletable once unused',
    (await call('DELETE', `/api/pharmacy/categories/${catId}`, { token })).status === 200);

  const revive = await call('PUT', `/api/pharmacy/medicines/${medId}`, { token, body: { isActive: true } });
  check('medicine can be reactivated', revive.status === 200 && revive.body?.data?.isActive === true, `status=${revive.status}`);

  // ---- lab tests --------------------------------------------------------
  console.log('\n[lab tests]');
  const lcat = await call('POST', '/api/lab/test-categories', { token, body: { name: stamp('Probe Lab Cat') } });
  check('lab category can be created', lcat.status === 201 && !!lcat.body?.data?._id,
    `status=${lcat.status} ${JSON.stringify(lcat.body)}`);
  const lcatId = lcat.body?.data?._id;

  const ltest = await call('POST', '/api/lab/tests', {
    token,
    body: { name: stamp('Probe Test'), price: 250, category: lcatId, parameters: [{ name: 'Hb', unit: 'g/dL', normalRange: '12-15' }] },
  });
  check('lab test can be created', ltest.status === 201 && !!ltest.body?.data?._id,
    `status=${ltest.status} ${JSON.stringify(ltest.body)}`);
  const testId = ltest.body?.data?._id;

  const testEdit = await call('PUT', `/api/lab/tests/${testId}`, { token, body: { price: 275 } });
  check('lab test price can be edited', testEdit.status === 200 && testEdit.body?.data?.price === 275,
    `status=${testEdit.status} ${JSON.stringify(testEdit.body?.data)}`);

  check('lab category in use cannot be deleted',
    (await call('DELETE', `/api/lab/test-categories/${lcatId}`, { token })).status >= 400);

  const retireTest = await call('DELETE', `/api/lab/tests/${testId}`, { token });
  check('lab test can be retired', retireTest.status === 200 && retireTest.body?.data?.active === false, `status=${retireTest.status}`);

  check('lab category is deletable once unused',
    (await call('DELETE', `/api/lab/test-categories/${lcatId}`, { token })).status === 200);

  // ---- result -----------------------------------------------------------
  console.log(`\n=== ${pass} passed, ${failures.length} failed ===`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
};

main().catch((err) => {
  console.error('\nprobe crashed:', err.message);
  process.exit(1);
});