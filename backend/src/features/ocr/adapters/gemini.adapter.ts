import { GoogleGenAI } from '@google/genai';
import type { OcrMode } from '@ocr-web/shared';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { HttpError } from '../../../middlewares/errorHandler';
import {
  ConcurrencySemaphore,
  USER_INSTRUCTION,
  getSystemPrompt,
  isRetryableModelError,
  sanitizeModelOutput,
  type OcrAdapter,
} from './ocr.adapter';

const GEMINI_TIMEOUT_MS = 60_000;
const defaultGeminiSemaphore = new ConcurrencySemaphore(env.GEMINI_MAX_CONCURRENCY);

export class GeminiOcrAdapter implements OcrAdapter {
  private readonly ai: GoogleGenAI;
  private readonly modelChain: string[];
  private readonly semaphore: ConcurrencySemaphore;
  private lastModelUsed: string | undefined;

  constructor(
    apiKey: string | undefined = env.GEMINI_API_KEY,
    primaryModel: string = env.GEMINI_MODEL_ID,
    fallbackModels: string[] = env.GEMINI_FALLBACK_MODELS,
    semaphore: ConcurrencySemaphore = defaultGeminiSemaphore
  ) {
    if (!apiKey) {
      throw new HttpError(
        503,
        'GEMINI_API_KEY no configurada en el servidor. Usá el motor Local o agregá la key en backend/.env.'
      );
    }
    this.ai = new GoogleGenAI({ apiKey });
    // Política innegociable: jamás incluir variantes "pro" en la cadena.
    const unique = Array.from(new Set([primaryModel, ...fallbackModels])).filter(
      (m) => Boolean(m) && !/\bpro\b/i.test(m)
    );
    this.modelChain = unique.length > 0 ? unique : ['gemini-3.5-flash-lite'];
    this.semaphore = semaphore;
  }

  getLastModelUsed(): string | undefined {
    return this.lastModelUsed;
  }

  private async callSingleModel(
    modelId: string,
    imageBase64: string,
    mimeType: string,
    mode: OcrMode
  ): Promise<string> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const work = this.ai.models.generateContent({
      model: modelId,
      contents: [
        USER_INSTRUCTION[mode],
        { inlineData: { data: imageBase64, mimeType } },
      ],
      config: {
        systemInstruction: getSystemPrompt(mode),
        temperature: 0,
        topP: 0.1,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: mode === 'highlight' ? 256 : 0 },
      },
    });

    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        logger.warn(`[Gemini][${modelId}] Request exceeded ${GEMINI_TIMEOUT_MS}ms timeout`);
        const err = new Error(`Gemini timeout after ${GEMINI_TIMEOUT_MS}ms (504)`) as Error & {
          status?: number;
        };
        err.status = 504;
        reject(err);
      }, GEMINI_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([work, timeout]);
      return sanitizeModelOutput(response.text ?? '', mode);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  async extractText(
    imageBuffer: Buffer,
    mimeType: string,
    mode: OcrMode = 'highlight'
  ): Promise<string> {
    return this.semaphore.run(async () => {
      const imageBase64 = imageBuffer.toString('base64');
      let lastError: unknown;

      for (let i = 0; i < this.modelChain.length; i++) {
        const modelId = this.modelChain[i];
        try {
          const text = await this.callSingleModel(modelId, imageBase64, mimeType, mode);
          this.lastModelUsed = modelId;
          return text;
        } catch (err) {
          lastError = err;
          const hasNext = i < this.modelChain.length - 1;
          if (hasNext && isRetryableModelError(err)) {
            logger.warn(
              `[Gemini] ${modelId} agotado/ocupado o con demora, saltando a respaldo liviano ${this.modelChain[i + 1]}`
            );
            continue;
          }
          throw err;
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Gemini falló en todos los modelos');
    });
  }
}
