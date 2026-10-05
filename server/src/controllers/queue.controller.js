import { success } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getQueueBoard } from '../services/queue.service.js';

export const queueBoardController = asyncHandler(async (req, res) => {
  const board = await getQueueBoard(req.query);
  success(res, board, 'Queue board fetched');
});