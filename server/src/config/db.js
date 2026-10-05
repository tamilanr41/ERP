import mongoose from 'mongoose';
import config from './index.js';
import logger from './logger.js';

export const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    // Pre-create all collections so MongoDB transactions never implicitly
    // create namespaces (implicit creation inside a txn raises WriteConflict 112).
    await ensureCollections();
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
    return mongoose.connection;
  } catch (error) {
    logger.error('MongoDB connection failed', { error: error.message });
    throw error;
  }
};

export const ensureCollections = async () => {
  const db = mongoose.connection.db;
  if (!db) return;
  const names = new Set(mongoose.modelNames());
  await Promise.all([...names].map((name) => {
    const model = mongoose.model(name);
    const collectionName = model.collection.name;
    return db.createCollection(collectionName).catch((err) => {
      // 48 = NamespaceExists; ignore
      if (err?.code === 48) return;
      logger.warn(`createCollection ${collectionName} failed`, { error: err.message });
    });
  }));
};

export default connectDB;