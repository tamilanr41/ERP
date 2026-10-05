import { Router } from 'express';
import { listController, statsController } from '../controllers/audit.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('AUDIT_VIEW'), listController);
router.get('/stats', requirePermission('AUDIT_VIEW'), statsController);

export default router;