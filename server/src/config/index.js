import dotenv from 'dotenv';

dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hospital_erp',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_access_secret_change_me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },

  upload: {
    provider: process.env.UPLOAD_PROVIDER || 'local',
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10,
    localDir: 'uploads',
  },

  aws: {
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.AWS_BUCKET,
    region: process.env.AWS_REGION,
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || 'Hospital ERP <noreply@hospital.local>',
  },

  rateLimit: {
    windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MIN, 10) || 15) * 60 * 1000,
    // 15 min window. 300/min-equivalent was fine for a web form but a hospital
    // command centre (bed board + workspace + billing polling) legitimately
    // exceeds it, so authenticated clinical traffic gets a wider budget.
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 3000,
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'superadmin@hospital.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
  },

  telemedicine: {
    // When on, a teleconsultation cannot be started until the appointment fee has
    // a bill and that bill is settled. Off by default so existing OPD-style
    // teleconsultations are not blocked by a missing billing configuration.
    requirePaymentBeforeConsultation:
      String(process.env.TELEMEDICINE_REQUIRE_PAYMENT || '').toLowerCase() === 'true',
    // Grace period, in minutes, before a booked-but-not-started teleconsultation
    // is treated as a no-show by the sweep in telemedicine.service.
    noShowAfterMinutes: parseInt(process.env.TELEMEDICINE_NO_SHOW_AFTER_MIN, 10) || 20,
    // ICE servers handed to the browser. A STUN-only list works on most networks
    // but cannot traverse symmetric NAT; a TURN entry is required for that.
    // Left empty rather than defaulted to a public server that may not be
    // reachable from this deployment.
    iceServers: String(process.env.TELEMEDICINE_ICE_SERVERS || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
  },
};

export default config;