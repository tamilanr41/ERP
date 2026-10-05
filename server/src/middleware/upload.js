import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import config from '../config/index.js';
import { BadRequestError } from '../utils/ApiError.js';
import logger from '../config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '../..');

export const ALLOWED_MIME = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/plain': ['.txt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
};

const provider = String(config.upload.provider || 'local').toLowerCase();

const uploadDir = path.join(rootDir, config.upload.localDir);
fs.mkdirSync(uploadDir, { recursive: true });

const limits = {
  fileSize: config.upload.maxFileSizeMb * 1024 * 1024,
};

const fileFilter = (req, file, cb) => {
  if (file.mimetype && ALLOWED_MIME[file.mimetype]) return cb(null, true);
  cb(new BadRequestError(`File type not allowed: ${file.mimetype}`));
};

const requestedDir = (req) => {
  const subDir = (req.query && req.query.dir) || 'documents';
  return String(subDir)
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/')
    .slice(0, 120);
};

const localStorage = multer.diskStorage({
  destination(req, file, cb) {
    const target = path.join(uploadDir, requestedDir(req));
    fs.mkdirSync(target, { recursive: true });
    cb(null, target);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ALLOWED_MIME[file.mimetype]?.[0] || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

let cloudinaryStorage = null;

/**
 * Cloudinary is used when UPLOAD_PROVIDER=cloudinary. Local disk is ephemeral on
 * Render/Railway, so anything written to server/uploads disappears on the next
 * deploy and previously stored /uploads paths 404. The SDK is imported lazily so
 * local development keeps working without the dependency loaded.
 */
const getCloudinaryStorage = async () => {
  if (cloudinaryStorage) return cloudinaryStorage;

  const { cloudName, apiKey, apiSecret } = config.cloudinary || {};
  const missing = [
    !cloudName && 'CLOUDINARY_CLOUD_NAME',
    !apiKey && 'CLOUDINARY_API_KEY',
    !apiSecret && 'CLOUDINARY_API_SECRET',
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(
      `UPLOAD_PROVIDER=cloudinary requires ${missing.join(', ')} to be set on the server`
    );
  }

  const { v2: cloudinary } = await import('cloudinary');
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

  cloudinaryStorage = {
    _handleFile(req, file, cb) {
      const folder = `hospital-erp/${requestedDir(req)}`;
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          public_id: `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`,
        },
        (err, result) => {
          if (err || !result) {
            return cb(err || new Error('Cloudinary upload failed'));
          }
          // Store the absolute URL so existing consumers (e.g.
          // patient.controller fileUrl) work without knowing the provider.
          file.publicPath = result.secure_url;
          file.cloudinaryPublicId = result.public_id;
          cb(null, { public_id: result.public_id, secure_url: result.secure_url });
        }
      );
      file.stream.on('error', cb);
      file.stream.pipe(stream);
    },
    _removeFile(req, file, cb) {
      if (!file?.cloudinaryPublicId) return cb(null);
      cloudinary.uploader
        .destroy(file.cloudinaryPublicId, { resource_type: 'auto' })
        .then(() => cb(null))
        .catch((e) => cb(e));
    },
  };

  logger.info('Upload provider', { provider: 'cloudinary', folder });
  return cloudinaryStorage;
};

const resolveStorage = (req, res, next) => {
  if (provider !== 'cloudinary') return next(null, localStorage);
  getCloudinaryStorage().then((s) => next(null, s), next);
};

/**
 * upload middleware. Use fieldName e.g. "file", "photo".
 */
export const uploader = (fieldName = 'file', maxCount = 1) => (req, res, next) => {
  resolveStorage(req, res, (err, storage) => {
    if (err) return next(err);
    const instance = multer({ storage, limits, fileFilter });
    const handle = maxCount > 1 ? instance.array(fieldName, maxCount) : instance.single(fieldName);
    handle(req, res, (uploadErr) => {
      if (uploadErr) return next(uploadErr);
      next();
    });
  });
};

export const sanitizeUpload = (req, _res, next) => {
  if (!req.file) return next();
  // Cloudinary already set an absolute URL in _handleFile.
  if (!req.file.publicPath) {
    req.file.publicPath = `/uploads/${path.relative(rootDir, req.file.path).replace(/\\/g, '/')}`;
  }
  next();
};

export default uploader;