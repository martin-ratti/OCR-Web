import { Request, Response, NextFunction } from 'express';
import { OcrService } from './ocr.service';
import {
  ExtractRequestSchema,
  type ExtractResponse,
  type OcrEngine,
  type OcrMode,
} from '@ocr-web/shared';
import { HttpError } from '../../middlewares/errorHandler';
import { withRequestId } from '../../config/logger';
import { recordOcrError, recordOcrSuccess } from '../../middlewares/metrics';
import { hasValidImageMagicBytes } from '../../middlewares/upload';

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

      if (!hasValidImageMagicBytes(req.file.buffer)) {
        throw new HttpError(400, 'El archivo subido no es una imagen válida o está dañado.');
      }

      const rawEngine =
        typeof req.body?.engine === 'string' ? req.body.engine.trim().toLowerCase() : undefined;
      const rawMode =
        typeof req.body?.mode === 'string' ? req.body.mode.trim().toLowerCase() : undefined;

      const parsed = ExtractRequestSchema.safeParse({
        engine: rawEngine,
        mode: rawMode,
      });
      if (!parsed.success) {
        throw new HttpError(
          400,
          'Parámetros inválidos. Usá engine="gemini" o "groq" y mode="highlight" o "full".'
        );
      }
      const engine: OcrEngine = parsed.data.engine ?? 'gemini';
      const mode: OcrMode = parsed.data.mode ?? 'highlight';

      log.info(
        `[OCR][${engine}][${mode}] File=${req.file.originalname} Mime=${req.file.mimetype} Size=${req.file.size}B`
      );

      const text = await this.ocrService.extractTextFromBuffer(
        req.file.buffer,
        req.file.mimetype,
        engine,
        mode
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
