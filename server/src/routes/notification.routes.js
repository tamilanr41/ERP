import { Router } from 'express';
import { listController, readController, readAllController } from '../controllers/notification.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { param } from 'express-validator';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('NOTIFICATION_VIEW'), listController);
router.patch('/read-all', requirePermission('NOTIFICATION_VIEW'), readAllController);
router.patch('/:id/read', requirePermission('NOTIFICATION_VIEW'), validate([param('id').isMongoId()]), readController);

export default router;