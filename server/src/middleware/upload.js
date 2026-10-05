import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import config from '../config/index.js';
import { BadRequestError } from '../utils/ApiError.js';

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

const uploadDir = path.join(rootDir, config.upload.localDir);
fs.mkdirSync(uploadDir, { recursive: true });

const limits = {
  fileSize: config.upload.maxFileSizeMb * 1024 * 1024,
};

const fileFilter = (req, file, cb) => {
  if (file.mimetype && ALLOWED_MIME[file.mimetype]) return cb(null, true);
  cb(new BadRequestError(`File type not allowed: ${file.mimetype}`));
};

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const subDir = (req.query && req.query.dir) || 'documents';
    const safe = path.normalize(subDir).replace(/^(\.\.(\/|\\|$))+/, '');
    const target = path.join(uploadDir, safe);
    fs.mkdirSync(target, { recursive: true });
    cb(null, target);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ALLOWED_MIME[file.mimetype]?.[0] || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

/**
 * upload middleware. Use fieldName e.g. "file", "photo".
 * provider abstraction used when storing references.
 */
export const uploader = (fieldName = 'file', maxCount = 1) => (req, res, next) => {
  const instance = multer({ storage, limits, fileFilter });
  const handle = maxCount > 1 ? instance.array(fieldName, maxCount) : instance.single(fieldName);
  handle(req, res, (err) => {
    if (err) return next(err);
    next();
  });
};

export const sanitizeUpload = (req, _res, next) => {
  if (!req.file) return next();
  req.file.publicPath = `/uploads/${path.relative(rootDir, req.file.path).replace(/\\/g, '/')}`;
  next();
};

export default uploader;