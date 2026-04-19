import { Router } from 'express';
import { OcrController } from './ocr.controller';
import { uploadImage } from '../../middlewares/upload';
import { ocrLimiter } from '../../middlewares/rateLimit';

export function createOcrRouter(controller: OcrController = new OcrController()): Router {
  const router = Router();
  router.post('/extract', ocrLimiter, uploadImage.single('image'), controller.extractText);
  return router;
}

const router = createOcrRouter();
export default router;
