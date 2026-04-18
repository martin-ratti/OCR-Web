import { Request, Response, NextFunction } from 'express';
import { OcrService } from './ocr.service';
import { ExtractResponse } from './ocr.schema';
import { HttpError } from '../../middlewares/errorHandler';
import { logger } from '../../config/logger';

export class OcrController {
  constructor(private readonly ocrService: OcrService = new OcrService()) {}

  extractText = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new HttpError(400, "No se subió ninguna imagen. Enviá Form-Data con el campo 'image'.");
      }

      logger.info(
        `[OCR] File=${req.file.originalname} Mime=${req.file.mimetype} Size=${req.file.size}B`
      );

      const text = await this.ocrService.extractTextFromBuffer(req.file.buffer, req.file.mimetype);

      const body: ExtractResponse = { status: 'success', text };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  };
}
