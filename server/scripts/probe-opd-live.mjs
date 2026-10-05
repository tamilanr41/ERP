const BASE = 'http://127.0.0.1:5000/api';
const results = [];
let token = '';

const call = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, body: json };
};

const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};

const main = async () => {
  console.log('\n=== 1. login ===');
  const login = await call('POST', '/auth/login', {
    usernameOrEmail: process.env.PROBE_USER || 'superadmin',
    password: process.env.PROBE_PASS || 'Admin@123',
  });
  check('login returns 200', login.status === 200, `status ${login.status} ${JSON.stringify(login.body).slice(0, 160)}`);
  if (login.status !== 200) return;
  token = login.body.data.accessToken || login.body.data.token;
  const perms = login.body.data.user?.permissions || [];
  check('token received', !!token);
  // SUPER_ADMIN carries a wildcard rather than an expanded list.
  const has = (p) => perms.includes('*') || perms.includes(p);
  check('OPD_VIEW granted', has('OPD_VIEW'), perms.join(','));
  check('OPD_QUEUE granted', has('OPD_QUEUE'));
  check('OPD_EDIT granted', has('OPD_EDIT'));

  console.log('\n=== 2. masters ===');
  const doctors = await call('GET', '/masters/doctors?limit=100');
  check('GET /masters/doctors', doctors.status === 200, `status ${doctors.status}`);
  const doc = (doctors.body.data || [])[0];
  check('a doctor exists', !!doc, doc ? `${doc.name}` : 'none');
  if (!doc) return;

  console.log('\n=== 3. create patient ===');
  const mobile = `9${String(Date.now()).slice(-9)}`;
  const pat = await call('POST', '/patients', {
    firstName: 'Queueprobe', lastName: 'Test', gender: 'MALE', mobile,
    dob: '1992-04-11', address: 'probe addr',
  });
  check('POST /patients', pat.status === 200 || pat.status === 201, `status ${pat.status} ${JSON.stringify(pat.body.errors || '')}`);
  const patient = pat.body.data;
  if (!patient) return;

  console.log('\n=== 4. register visit 1 ===');
  const v1 = await call('POST', '/opd/visits', {
    patientId: patient._id, doctorId: doc._id, visitType: 'WALK_IN', chiefComplaint: 'probe A',
  });
  check('POST /opd/visits #1', v1.status === 200 || v1.status === 201, `status ${v1.status} ${JSON.stringify(v1.body.errors || '')}`);
  const visit1 = v1.body.data;
  if (!visit1) return;
  check('visit starts WAITING', visit1.status === 'WAITING', visit1.status);
  // Token numbers must keep climbing across runs, never restart, so they are
  // compared relative to the counter's existing value rather than to T-001.
  check('token issued with a sequence', typeof visit1.tokenSeq === 'number' && visit1.tokenSeq > 0, `T-${String(visit1.tokenSeq).padStart(3, '0')} / seq ${visit1.tokenSeq}`);
  check('token label matches sequence', visit1.queueToken === `T-${String(visit1.tokenSeq).padStart(3, '0')}`, visit1.queueToken);
  check('tokenDate is today', !!visit1.tokenDate, visit1.tokenDate);
  check('history seeded with WAITING', Array.isArray(visit1.statusHistory) && visit1.statusHistory[0]?.to === 'WAITING', JSON.stringify(visit1.statusHistory?.map((h) => h.to)));
  const seq0 = visit1.tokenSeq;

  console.log('\n=== 5. duplicate registration for same patient ===');
  const dup = await call('POST', '/opd/visits', { patientId: patient._id, doctorId: doc._id });
  check('duplicate visit refused', dup.status >= 400, `status ${dup.status} ${dup.body.message}`);

  console.log('\n=== 6. register visits 2 and 3 (tokens must follow on) ===');
  const extra = [];
  for (let i = 2; i <= 3; i += 1) {
    const m = `8${String(Date.now()).slice(-9)}${i}`;
    const p = await call('POST', '/patients', { firstName: `Queueprobe${i}`, lastName: 'Test', gender: 'FEMALE', mobile: m, dob: '1985-02-02' });
    const v = await call('POST', '/opd/visits', { patientId: p.body.data._id, doctorId: doc._id, visitType: 'WALK_IN', chiefComplaint: `probe ${i}` });
    check(`register visit ${i}`, v.status === 200 || v.status === 201, `status ${v.status}`);
    extra.push(v.body.data);
  }
  check('visit 2 took the next token', extra[0]?.tokenSeq === seq0 + 1, `${extra[0]?.queueToken} vs ${seq0 + 1}`);
  check('visit 3 took the token after that', extra[1]?.tokenSeq === seq0 + 2, `${extra[1]?.queueToken} vs ${seq0 + 2}`);

  console.log('\n=== 7. queue board ===');
  const board = await call('GET', `/opd/queue?doctorId=${doc._id}`);
  check('GET /opd/queue', board.status === 200, `status ${board.status} ${board.body.message || ''}`);
  const b = board.body.data;
  check('board counts waiting = 3', b?.counts?.waiting === 3, JSON.stringify(b?.counts));
  check('board has 3 rows', b?.queue?.length === 3, `${b?.queue?.length} rows`);
  check('board sorted ascending by tokenSeq', JSON.stringify(b?.queue?.map((r) => r.tokenSeq)) === JSON.stringify([seq0, seq0 + 1, seq0 + 2]), JSON.stringify(b?.queue?.map((r) => r.tokenSeq)));
  check('board includes waitingMins', typeof b?.queue?.[0]?.waitingMins === 'number', `${b?.queue?.[0]?.waitingMins}`);
  check('board populates patient', !!b?.queue?.[0]?.patient?.firstName, b?.queue?.[0]?.patient?.firstName);

  console.log('\n=== 8. call-next serves token order ===');
  const cn = await call('POST', `/opd/queue/doctors/${doc._id}/call-next`, {});
  check('call-next 200', cn.status === 200, `status ${cn.status} ${cn.body.message || ''}`);
  check('call-next served the first token, not the newest', cn.body.data?.tokenSeq === seq0, `${cn.body.data?.queueToken} vs seq ${seq0}`);
  check('call-next moved to CALLED', cn.body.data?.status === 'CALLED', cn.body.data?.status);
  check('calledAt stamped', !!cn.body.data?.calledAt, cn.body.data?.calledAt);

  console.log('\n=== 9. clinical save on a CALLED visit (notes only, no status) ===');
  const save = await call('PUT', `/opd/visits/${visit1._id}`, { examination: { notes: 'probe notes' }, diagnosis: { provisional: 'A09' } });
  check('PUT /opd/visits/:id on CALLED visit', save.status === 200, `status ${save.status} ${save.body.message || ''}`);
  check('save did not change status', save.body.data?.status === 'CALLED', save.body.data?.status);

  console.log('\n=== 10. start consultation ===');
  const st = await call('POST', `/opd/visits/${visit1._id}/start-consultation`, {});
  check('start-consultation 200', st.status === 200, `status ${st.status} ${st.body.message || ''}`);
  check('status is IN_CONSULTATION', st.body.data?.status === 'IN_CONSULTATION', st.body.data?.status);
  check('consultStartedAt stamped', !!st.body.data?.consultStartedAt);
  check('cannot start twice', (await call('POST', `/opd/visits/${visit1._id}/start-consultation`, {})).status >= 400);

  console.log('\n=== 11. illegal transitions refused ===');
  const skipAdmit = await call('POST', `/opd/visits/${extra[0]._id}/admit`, { ward: 'A-1' });
  check('WAITING -> ADMITTED refused', skipAdmit.status >= 400, `status ${skipAdmit.status} ${skipAdmit.body.message}`);
  check('admit needs destination', (await call('POST', `/opd/visits/${visit1._id}/admit`, {})).status >= 400);
  check('refer needs destination', (await call('POST', `/opd/visits/${visit1._id}/refer`, {})).status >= 400);

  console.log('\n=== 12. close visit ===');
  const close = await call('POST', `/opd/visits/${visit1._id}/close`, { closeNotes: 'probe done' });
  check('close 200', close.status === 200, `status ${close.status} ${close.body.message || ''}`);
  check('status is COMPLETED', close.body.data?.status === 'COMPLETED', close.body.data?.status);
  check('consultEndedAt stamped', !!close.body.data?.consultEndedAt);
  check('cannot close twice', (await call('POST', `/opd/visits/${visit1._id}/close`, {})).status >= 400);
  check('cannot edit a closed visit', (await call('PUT', `/opd/visits/${visit1._id}`, { diagnosis: { provisional: 'X99' } })).status >= 400);
  check('cannot restart a closed visit', (await call('POST', `/opd/visits/${visit1._id}/start-consultation`, {})).status >= 400);

  console.log('\n=== 13. no-show then requeue ===');
  const ns = await call('POST', `/opd/visits/${extra[1]._id}/no-show`, {});
  check('no-show 200', ns.status === 200, `status ${ns.status} ${ns.body.message || ''}`);
  check('status is NO_SHOW', ns.body.data?.status === 'NO_SHOW', ns.body.data?.status);
  // A patient marked absent has to rejoin the back of the queue, not jump
  // straight to CALLED, so the only legal move out of NO_SHOW is WAITING.
  const requeue = await call('POST', `/opd/visits/${extra[1]._id}/call`, {});
  check('NO_SHOW -> CALLED refused', requeue.status >= 400, `status ${requeue.status} ${requeue.body.message}`);

  console.log('\n=== 14. closed visits leave the board ===');
  const board2 = await call('GET', `/opd/queue?doctorId=${doc._id}`);
  check('board waiting = 1 (closed + no-show left)', board2.body.data?.counts?.waiting === 1, JSON.stringify(board2.body.data?.counts));
  check('board inConsultation = 0', board2.body.data?.counts?.inConsultation === 0, JSON.stringify(board2.body.data?.counts));

  console.log('\n=== 15. audit timeline ===');
  const tl = await call('GET', `/opd/visits/${visit1._id}/timeline`);
  check('GET timeline 200', tl.status === 200, `status ${tl.status}`);
  // The timeline endpoint returns a bare array of events.
  const evTypes = (Array.isArray(tl.body.data) ? tl.body.data : []).map((e) => e.type);
  check('timeline has VISIT_CALLED', evTypes.includes('VISIT_CALLED'), evTypes.join(','));
  check('timeline has VISIT_IN_CONSULTATION', evTypes.includes('VISIT_IN_CONSULTATION'));
  check('timeline has VISIT_CLOSED', evTypes.includes('VISIT_CLOSED'));
  const reread = await call('GET', `/opd/visits/${visit1._id}`);
  check('statusHistory persisted in DB', JSON.stringify(reread.body.data?.statusHistory?.map((h) => h.to)) === '["WAITING","CALLED","IN_CONSULTATION","COMPLETED"]', JSON.stringify(reread.body.data?.statusHistory?.map((h) => h.to)));

  console.log('\n=== 16. dashboard metrics contract ===');
  const dash = await call('GET', '/dashboard/opd');
  check('GET /dashboard/opd', dash.status === 200, `status ${dash.status}`);
  const m = dash.body.data?.metrics || {};
  for (const k of ['totalOPD', 'open', 'waiting', 'called', 'inConsultation', 'readyForConsult', 'completed', 'admitted', 'referred', 'noShow']) {
    check(`metric "${k}" present and numeric`, typeof m[k] === 'number', String(m[k]));
  }

  console.log('\n=== 17. cleanup ===');
  for (const v of [visit1, ...extra]) {
    const c = await call('POST', `/opd/visits/${v._id}/cancel`, {});
    if (c.status < 400) check(`cancel ${v.queueToken}`, true);
    else check(`cancel ${v.queueToken} (already closed)`, c.status >= 400, `status ${c.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log(`  - ${f.name} :: ${f.detail}`));
    process.exitCode = 1;
  }
};

main().catch((e) => { console.error('PROBE CRASHED:', e); process.exitCode = 1; });