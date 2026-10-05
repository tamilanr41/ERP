import { searchAll } from '../services/search.service.js';
import asyncHandler from '../utils/asyncHandler.js';

export const globalSearchController = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const types = req.query.types ? String(req.query.types).split(',').map((t) => t.trim()) : '*';
  const limit = parseInt(req.query.limit, 10) || 6;

  if (!q) {
    return res.json({ success: true, message: 'No results', data: { query: q, results: {} } });
  }

  const data = await searchAll({ q, types, actor: req.user, limit });
  return res.json({ success: true, message: 'Search results', data });
});