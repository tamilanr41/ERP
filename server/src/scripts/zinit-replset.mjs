import { MongoClient } from 'mongodb';

const c = new MongoClient(
  'mongodb://127.0.0.1:61405/admin?directConnection=true',
  { serverSelectionTimeoutMS: 6000 },
);
try {
  await c.connect();
  try {
    await c.db('admin').command({
      replSetInitiate: {
        _id: 'testset',
        members: [{ _id: 0, host: '127.0.0.1:61405' }],
      },
    });
    console.log('replSetInitiate issued');
  } catch (e) {
    const m = String(e.errmsg || e.message || '');
    if (m.includes('already initialized')) console.log('already initialized');
    else throw e;
  }
  await c.close();
} catch (e) {
  console.error('INIT FAIL:', e.message);
  process.exit(1);
}
