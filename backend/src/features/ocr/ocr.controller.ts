import { Request, Response, NextFunction } from 'express';
import { OcrService } from './ocr.service';
import { ExtractRequestSchema, type ExtractResponse, type OcrEngine } from '@ocr-web/shared';
import { HttpError } from '../../middlewares/errorHandler';
import { withRequestId } from '../../config/logger';
import { recordOcrError, recordOcrSuccess } from '../../middlewares/metrics';

function isRateLimited(err: unknown): boolean {
  const m = (err as { message?: string })?.message ?? '';
  const s = (err as { status?: number })?.status;
  return s === 429 || /429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(m);
}

export class OcrController {
  constructor(private readonly ocrService: OcrService = new OcrService()) {}

  extractText = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reqId = (req as Request & { requestId?: string }).requestId;
    const log = withRequestId(reqId);
    try {
      if (!req.file) {
        throw new HttpError(400, "No se subió ninguna imagen. Enviá Form-Data con el campo 'image'.");
      }

      const rawEngine = typeof req.body?.engine === 'string'
        ? req.body.engine.trim().toLowerCase()
        : undefined;
      const parsed = ExtractRequestSchema.safeParse({ engine: rawEngine });
      if (!parsed.success) {
        throw new HttpError(400, 'Engine inválido. Usá "gemini" o "paddle".');
      }
      const engine: OcrEngine = parsed.data.engine ?? 'gemini';

      log.info(
        `[OCR][${engine}] File=${req.file.originalname} Mime=${req.file.mimetype} Size=${req.file.size}B`
      );

      const text = await this.ocrService.extractTextFromBuffer(
        req.file.buffer,
        req.file.mimetype,
        engine,
      );

      recordOcrSuccess();
      const body: ExtractResponse = { status: 'success', text };
      res.status(200).json(body);
    } catch (err) {
      recordOcrError(isRateLimited(err));
      next(err);
    }
  };
}
