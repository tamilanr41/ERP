import { Router } from 'express';
import { queueBoardController } from '../controllers/queue.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureFlag.js';

const router = Router();
router.use(authenticate);

router.get('/board', requirePermission('OPD_VIEW', 'APPOINTMENT_VIEW'), requireFeature('ENABLE_QUEUE'), queueBoardController);

export default router;