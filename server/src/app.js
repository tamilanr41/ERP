import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import logger from './config/logger.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { globalRateLimit } from './middleware/rateLimiter.js';
import { requestId } from './middleware/requestId.js';
import { authenticate, requirePermission } from './middleware/auth.js';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: [config.clientUrl, 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestId);
app.use(globalRateLimit);

// request logging with request id + timing
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.originalUrl.startsWith('/api')) {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`, { requestId: req.id });
    }
  });
  next();
});

// health (legacy alias) and v1 platform endpoints are served by routes.
// v1 + legacy aliases share the same router; tenant context is attached by authenticate.
app.use('/api/v1', routes);
app.use('/api', routes);

// static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Admin Command Center (static, self-contained) served at /admin before the SPA fallback.
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../command-center.html'));
});

// SPA: serve the built React client (client/dist) so a single origin runs both.
// Assets are never cached — a clinical workstation must always load the build
// that is on disk, otherwise theme updates appear not to apply.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist, {
    etag: true,
    lastModified: true,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store, must-revalidate'),
  }));
  app.get(/^(?!\/api\/|\/uploads\/|\/socket\.io\/).*/, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use('/api/v1', notFound);
app.use('/api', notFound);
app.use(errorHandler);

export default app;
