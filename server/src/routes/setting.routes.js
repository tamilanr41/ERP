import { Router } from 'express';
import { getSettingsController, saveSettingsController } from '../controllers/setting.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { body } from 'express-validator';

const router = Router();
router.use(authenticate);

router.get('/', getSettingsController);
router.put('/', requirePermission('SETTINGS_MANAGE', 'HOSPITAL_MANAGE'), validate([
  body('group').trim().notEmpty(),
  body('entries').isObject().withMessage('entries object required'),
]), saveSettingsController);

export default router;