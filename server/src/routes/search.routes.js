import { Router } from 'express';
import { globalSearchController } from '../controllers/search.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureFlag.js';

const router = Router();
router.use(authenticate);
router.get('/', requireFeature('ENABLE_GLOBAL_SEARCH'), globalSearchController);

export default router;