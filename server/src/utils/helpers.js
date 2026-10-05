import mongoose from 'mongoose';
import { BadRequestError } from './ApiError.js';

export const isValidId = (id) => mongoose.isValidObjectId(id);

export const parseObjectId = (id, label = 'id') => {
  if (!isValidId(id)) throw new BadRequestError(`Invalid ${label}`);
  return new mongoose.Types.ObjectId(id);
};

export const toObjectId = (id) => (isValidId(id) ? new mongoose.Types.ObjectId(id) : id);

export const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((key) => key in obj).map((key) => [key, obj[key]]));

export const omit = (obj, keys) =>
  Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));

export const paginateOptions = (query, defaults = {}) => {
  const page = Math.max(parseInt(query.page, 10) || defaults.page || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaults.limit || 20, 1), 100);
  const sortBy = query.sortBy || defaults.sortBy || 'createdAt';
  const order = query.order === 'asc' ? 1 : -1;
  return { page, limit, sort: { [sortBy]: order } };
};

export const buildPagination = (total, page, limit) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit) || 0,
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

// Debounced / comma + regex safe search builder
export const regex = (value) => (value ? new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null);

export const cleanText = (value) => (typeof value === 'string' ? value.trim() : value);