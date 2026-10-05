/**
 * Remove the rows probe-settings-live.mjs leaves behind.
 *
 * The probe deliberately leaves its records in place as evidence that the
 * endpoints really wrote to Mongo, but re-running it would otherwise pile up
 * junk in the local development database.
 */
import mongoose from 'mongoose';
import config from '../src/config/index.js';

const run = async () => {
  await mongoose.connect(config.mongoUri);

  const results = await Promise.all([
    mongoose.connection.collection('users').deleteMany({ username: /^probe_/ }),
    mongoose.connection.collection('medicines').deleteMany({ name: /^Probe Med/ }),
    mongoose.connection.collection('medicinecategories').deleteMany({ name: /^Probe (Cat|Manu)/ }),
    mongoose.connection.collection('labtests').deleteMany({ name: /^Probe Test/ }),
    mongoose.connection.collection('labcategories').deleteMany({ name: /^Probe Lab Cat/ }),
  ]);

  results.forEach((r, i) => console.log(`  collection ${i}: removed ${r.deletedCount}`));
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});