import { logger } from '../../config/logger';
import type { OcrEngine, OcrMode } from '@ocr-web/shared';
import { HttpError } from '../../middlewares/errorHandler';
import {
  ConcurrencySemaphore,
  isRetryableModelError,
  sanitizeModelOutput,
  type OcrAdapter,
  type OcrExtractionResult,
} from './adapters/ocr.adapter';
import { GeminiOcrAdapter } from './adapters/gemini.adapter';
import { GroqOcrAdapter } from './adapters/groq.adapter';

export {
  ConcurrencySemaphore,
  GeminiOcrAdapter,
  GroqOcrAdapter,
  isRetryableModelError,
  sanitizeModelOutput,
  type OcrAdapter,
  type OcrExtractionResult,
};

export class OcrService {
  private readonly overrides: Partial<Record<OcrEngine, OcrAdapter>>;
  private geminiAdapter: OcrAdapter | null = null;
  private groqAdapter: OcrAdapter | null = null;
  private lastModelUsed: string | undefined;

  constructor(adapters?: Partial<Record<OcrEngine, OcrAdapter>>) {
    this.overrides = adapters ?? {};
  }

  private getAdapter(engine: OcrEngine): OcrAdapter {
    if (engine === 'gemini') {
      if (this.overrides.gemini) return this.overrides.gemini;
      if (!this.geminiAdapter) this.geminiAdapter = new GeminiOcrAdapter();
      return this.geminiAdapter;
    }
    if (engine === 'groq') {
      if (this.overrides.groq) return this.overrides.groq;
      if (!this.groqAdapter) this.groqAdapter = new GroqOcrAdapter();
      return this.groqAdapter;
    }
    if (engine === 'paddle') {
      if (this.overrides.paddle) return this.overrides.paddle;
      throw new HttpError(
        410,
        'El motor "paddle" se ejecuta ahora en el navegador. No envíes engine=paddle al backend.'
      );
    }
    throw new HttpError(400, `Engine no soportado: ${engine}`);
  }

  getLastModelUsed(): string | undefined {
    return this.lastModelUsed;
  }

  async extractTextFromBuffer(
    imageBuffer: Buffer,
    mimeType: string,
    engine: OcrEngine = 'gemini',
    mode: OcrMode = 'highlight'
  ): Promise<string> {
    try {
      const adapter = this.getAdapter(engine);
      const rawResult = await adapter.extractText(imageBuffer, mimeType, mode);
      if (typeof rawResult === 'string') {
        this.lastModelUsed = adapter.getLastModelUsed?.();
        return rawResult;
      }
      this.lastModelUsed = rawResult.modelUsed || adapter.getLastModelUsed?.();
      return rawResult.text;
    } catch (error) {
      logger.error(`[OcrService][${engine}][${mode}]`, error);
      throw error;
    }
  }
}
