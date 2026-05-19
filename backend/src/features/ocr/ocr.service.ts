import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { HIGHLIGHT_EXTRACTION_PROMPT } from '../../config/prompt';
import { logger } from '../../config/logger';
import type { OcrEngine } from '@ocr-web/shared';
import { HttpError } from '../../middlewares/errorHandler';

const MODEL_ID = 'gemini-2.5-flash-lite';
// 90s (antes 60s): muestras reales en samples del usuario tardan hasta 50s
// para páginas densas con muchas regiones resaltadas. 60s dejaba poca cabeza
// y disparaba timeouts antes de que la API terminara legitimamente.
const GEMINI_TIMEOUT_MS = 90_000;

export interface OcrAdapter {
  extractText(imageBuffer: Buffer, mimeType: string): Promise<string>;
}

export class GeminiOcrAdapter implements OcrAdapter {
  private ai: GoogleGenAI;

  constructor(apiKey: string | undefined = env.GEMINI_API_KEY) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurada. Usá el motor offline o agregá la key en backend/.env.');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async extractText(imageBuffer: Buffer, mimeType: string): Promise<string> {
    const timeoutId = setTimeout(() => {
      logger.warn(`[Gemini] Request exceeded ${GEMINI_TIMEOUT_MS}ms timeout`);
    }, GEMINI_TIMEOUT_MS);

    const work = this.ai.models.generateContent({
      model: MODEL_ID,
      contents: [
        HIGHLIGHT_EXTRACTION_PROMPT,
        { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
      ],
      config: {
        temperature: 0,
        topP: 0.1,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Gemini timeout after ${GEMINI_TIMEOUT_MS}ms`)),
        GEMINI_TIMEOUT_MS,
      );
    });

    try {
      const response = await Promise.race([work, timeout]);
      return response.text ? response.text.trim() : '';
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export class OcrService {
  private readonly overrides: Partial<Record<OcrEngine, OcrAdapter>>;
  private geminiAdapter: OcrAdapter | null = null;

  constructor(adapters?: Partial<Record<OcrEngine, OcrAdapter>>) {
    this.overrides = adapters ?? {};
  }

  private getAdapter(engine: OcrEngine): OcrAdapter {
    if (engine === 'gemini') {
      if (this.overrides.gemini) return this.overrides.gemini;
      if (!this.geminiAdapter) this.geminiAdapter = new GeminiOcrAdapter();
      return this.geminiAdapter;
    }
    // Paddle fue retirado del backend: el motor local ahora corre en el navegador
    // (tesseract.js). El frontend nunca debería llegar acá con engine=paddle,
    // pero si lo hace devolvemos 410 Gone para señalar que el endpoint no existe.
    if (engine === 'paddle') {
      if (this.overrides.paddle) return this.overrides.paddle;
      throw new HttpError(410, 'El motor "paddle" se ejecuta ahora en el navegador. No envíes engine=paddle al backend.');
    }
    throw new HttpError(400, `Engine no soportado: ${engine}`);
  }

  async extractTextFromBuffer(
    imageBuffer: Buffer,
    mimeType: string,
    engine: OcrEngine = 'gemini',
  ): Promise<string> {
    try {
      return await this.getAdapter(engine).extractText(imageBuffer, mimeType);
    } catch (error) {
      logger.error(`[OcrService][${engine}]`, error);
      throw error;
    }
  }
}
