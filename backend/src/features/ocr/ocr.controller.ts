import { Request, Response, NextFunction } from 'express';
import { OcrService } from './ocr.service';
import { ExtractRequestSchema, ExtractResponse, OcrEngine } from './ocr.schema';
import { HttpError } from '../../middlewares/errorHandler';
import { logger } from '../../config/logger';

export class OcrController {
  constructor(private readonly ocrService: OcrService = new OcrService()) {}

  extractText = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new HttpError(400, "No se subió ninguna imagen. Enviá Form-Data con el campo 'image'.");
      }

      const parsed = ExtractRequestSchema.safeParse({ engine: req.body?.engine });
      if (!parsed.success) {
        throw new HttpError(400, 'Engine inválido. Usá "gemini" o "tesseract".');
      }
      const engine: OcrEngine = parsed.data.engine ?? 'gemini';

      logger.info(
        `[OCR][${engine}] File=${req.file.originalname} Mime=${req.file.mimetype} Size=${req.file.size}B`
      );

      const text = await this.ocrService.extractTextFromBuffer(
        req.file.buffer,
        req.file.mimetype,
        engine,
      );

      const body: ExtractResponse = { status: 'success', text };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  };
}
