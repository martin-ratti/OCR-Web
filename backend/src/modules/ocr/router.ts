import { Router } from 'express';
import { extractTextController } from './controller';
import { uploadMiddleware } from '../../middlewares/upload';

const router = Router();
router.post('/extract', uploadMiddleware.single('image'), extractTextController);

export { router as ocrRouter };