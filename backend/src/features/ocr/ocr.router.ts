import { Router } from 'express';
import { OcrController } from './ocr.controller';
import { uploadImage } from '../../middlewares/upload';
import { ocrLimiter } from '../../middlewares/rateLimit';

const router = Router();
const ocrController = new OcrController();

router.post('/extract', ocrLimiter, uploadImage.single('image'), ocrController.extractText);

export default router;
