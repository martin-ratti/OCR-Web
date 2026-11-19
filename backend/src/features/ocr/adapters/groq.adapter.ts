import type { OcrMode } from '@ocr-web/shared';
import { env } from '../../../config/env';
import { HttpError } from '../../../middlewares/errorHandler';
import {
  USER_INSTRUCTION,
  getSystemPrompt,
  sanitizeModelOutput,
  type OcrAdapter,
} from './ocr.adapter';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TIMEOUT_MS = 45_000;

export class GroqOcrAdapter implements OcrAdapter {
  private readonly apiKey: string;
  private readonly modelId: string;

  constructor(
    apiKey: string | undefined = env.GROQ_API_KEY,
    modelId: string = env.GROQ_MODEL_ID
  ) {
    if (!apiKey) {
      throw new HttpError(
        503,
        'GROQ_API_KEY no configurada en el servidor. Agregá la key en backend/.env o usá otro motor.'
      );
    }
    this.apiKey = apiKey;
    this.modelId = modelId;
  }

  getLastModelUsed(): string {
    return this.modelId;
  }

  async extractText(
    imageBuffer: Buffer,
    mimeType: string,
    mode: OcrMode = 'highlight'
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    try {
      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.modelId,
          temperature: 0,
          top_p: 0.1,
          max_tokens: 2048,
          messages: [
            {
              role: 'system',
              content: getSystemPrompt(mode),
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: USER_INSTRUCTION[mode] },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const snippet = body.slice(0, 400);
        if (res.status === 429) {
          throw new Error(`Groq rate limit (429): ${snippet}`);
        }
        if (res.status === 503 || res.status === 502 || res.status === 504) {
          throw new Error(`Groq upstream unavailable (${res.status}): ${snippet}`);
        }
        throw new Error(`Groq HTTP ${res.status}: ${snippet}`);
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = json.choices?.[0]?.message?.content ?? '';
      return typeof rawText === 'string' ? sanitizeModelOutput(rawText, mode) : '';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        const timeoutErr = new Error(`Groq timeout after ${GROQ_TIMEOUT_MS}ms (504)`) as Error & {
          status?: number;
        };
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
