import http from 'http';
import app from './app.js';
import config from './config/index.js';
import logger from './config/logger.js';
import { connectDB } from './config/db.js';
import { bootstrapRoles, bootstrapAdminUser } from './services/auth.service.js';
import { bootstrapFeatureFlags } from './services/featureFlag.service.js';
import { seedExaminationTemplates, seedDiagnosisMaster, migrateLegacyOpdVisits } from './services/opd.service.js';
import { backfillUserNames } from './services/auth.service.js';
import { ensureChargeConfig } from './services/ipd.billing.service.js';
import { seedDialysisInfrastructure } from './services/dialysis.seed.js';
import { ensureDialysisCharge } from './services/dialysis.billing.service.js';
import { initSocketServer } from './utils/socket.io.server.js';

const start = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected');
    await bootstrapRoles();
    logger.info('Roles & permissions bootstrapped');
    const admin = await bootstrapAdminUser();
    if (admin.created) logger.info('First-run admin account provisioned');
    else logger.info('Admin bootstrap skipped', { reason: admin.reason });
    await bootstrapFeatureFlags();
    logger.info('Feature flags bootstrapped');
    await backfillUserNames();
    // Runs on every boot so a database created before the OPD queue split is
    // never left holding visits that cannot be closed.
    const opdMigrated = await migrateLegacyOpdVisits();
    if (opdMigrated) logger.info(`OPD legacy IN_PROGRESS visits migrated | ${JSON.stringify({ migrated: opdMigrated })}`);
    await ensureChargeConfig();
    await seedExaminationTemplates();
    logger.info('Examination templates seeded');
    await seedDiagnosisMaster();
    logger.info('Diagnosis dictionary seeded');
    await seedDialysisInfrastructure(logger);
    await ensureDialysisCharge();

    const server = http.createServer(app);
    initSocketServer(server, {
      corsOrigin: [config.clientUrl, 'http://localhost:5173', 'http://localhost:3000']
        .flatMap((o) => String(o || '').split(','))
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    });
    logger.info('Socket.IO realtime attached');

    server.listen(config.port, () => {
      logger.info(`ZhanX HospitalOS API + realtime listening on port ${config.port} (${config.env})`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
};

start();
