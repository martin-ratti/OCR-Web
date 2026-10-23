import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import {
  HIGHLIGHT_EXTRACTION_PROMPT,
  FULL_PAGE_EXTRACTION_PROMPT,
  NO_HIGHLIGHT_SENTINEL,
} from '../../config/prompt';
import { logger } from '../../config/logger';
import type { OcrEngine, OcrMode } from '@ocr-web/shared';
import { HttpError } from '../../middlewares/errorHandler';

const GEMINI_TIMEOUT_MS = 60_000;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TIMEOUT_MS = 45_000;

const USER_INSTRUCTION: Record<OcrMode, string> = {
  highlight: 'Extraé solo el texto con marcador resaltador.',
  full: 'Transcribí literalmente todo el texto visible.',
};

function getSystemPrompt(mode: OcrMode): string {
  return mode === 'full' ? FULL_PAGE_EXTRACTION_PROMPT : HIGHLIGHT_EXTRACTION_PROMPT;
}

/**
 * Limpia artefactos de modelos con razonamiento (<think>...</think>), bloques
 * markdown envolventes y frases introductorias no solicitadas.
 */
export function sanitizeModelOutput(raw: string, mode: OcrMode): string {
  if (!raw) return '';
  let text = raw
    // Bloques de razonamiento explícitos (ej. Qwen3 / DeepSeek style)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // Si quedó un <think> truncado al inicio sin cierre, descartar hasta doble salto
    .replace(/^<think>[\s\S]*$/gi, '')
    .trim();

  // Quitar code fences envolventes ```text ... ```
  const fenceMatch = text.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\r?\n([\s\S]*?)\r?\n?```$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Quitar preámbulos conversacionales típicos si un modelo desobedece
  text = text
    .replace(
      /^(?:Aquí tienes|Aquí está|A continuación|Esta es)\s+(?:la\s+)?transcripci[óo]n[^:\n]*:\s*\r?\n+/i,
      ''
    )
    .trim();

  // Normalizar sentinel en modo resaltado si vino entre comillas
  if (mode === 'highlight') {
    const unquoted = text.replace(/^["'«“]+|["'»”]+$/g, '').trim();
    if (
      unquoted === NO_HIGHLIGHT_SENTINEL ||
      /^no se detect[óo] texto resaltado en esta imagen\.?$/i.test(unquoted)
    ) {
      return NO_HIGHLIGHT_SENTINEL;
    }
  }

  return text;
}

function isRetryableModelError(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  const s = anyErr?.status;
  const m = anyErr?.message ?? '';
  return (
    s === 429 ||
    s === 503 ||
    s === 404 ||
    /429|503|404|RESOURCE_EXHAUSTED|UNAVAILABLE|quota|rate limit|high demand|overloaded|not found|no longer available/i.test(
      m
    )
  );
}

export interface OcrAdapter {
  extractText(imageBuffer: Buffer, mimeType: string, mode?: OcrMode): Promise<string>;
}

export class GeminiOcrAdapter implements OcrAdapter {
  private readonly ai: GoogleGenAI;
  private readonly modelChain: string[];

  constructor(
    apiKey: string | undefined = env.GEMINI_API_KEY,
    primaryModel: string = env.GEMINI_MODEL_ID,
    fallbackModels: string[] = env.GEMINI_FALLBACK_MODELS
  ) {
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY no configurada. Usá el motor Local o agregá la key en backend/.env.'
      );
    }
    this.ai = new GoogleGenAI({ apiKey });
    // Política innegociable: jamás incluir variantes "pro" en la cadena.
    const unique = Array.from(new Set([primaryModel, ...fallbackModels])).filter(
      (m) => Boolean(m) && !/\bpro\b/i.test(m)
    );
    this.modelChain = unique.length > 0 ? unique : ['gemini-3.5-flash-lite'];
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
        // Optimización de tokens: transcripción completa no requiere tokens de pensamiento;
        // en modo resaltado 256 tokens alcanzan para discriminar marcador vs birome.
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
    const imageBase64 = imageBuffer.toString('base64');
    let lastError: unknown;

    for (let i = 0; i < this.modelChain.length; i++) {
      const modelId = this.modelChain[i];
      try {
        return await this.callSingleModel(modelId, imageBase64, mimeType, mode);
      } catch (err) {
        lastError = err;
        const hasNext = i < this.modelChain.length - 1;
        if (hasNext && isRetryableModelError(err)) {
          logger.warn(
            `[Gemini] ${modelId} agotado/ocupado, saltando a respaldo ${this.modelChain[i + 1]}`
          );
          continue;
        }
        throw err;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Gemini falló en todos los modelos');
  }
}

export class GroqOcrAdapter implements OcrAdapter {
  private readonly apiKey: string;
  private readonly modelId: string;

  constructor(
    apiKey: string | undefined = env.GROQ_API_KEY,
    modelId: string = env.GROQ_MODEL_ID
  ) {
    if (!apiKey) {
      throw new Error('GROQ_API_KEY no configurada. Agregá la key en backend/.env o usá otro motor.');
    }
    this.apiKey = apiKey;
    this.modelId = modelId;
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

export class OcrService {
  private readonly overrides: Partial<Record<OcrEngine, OcrAdapter>>;
  private geminiAdapter: OcrAdapter | null = null;
  private groqAdapter: OcrAdapter | null = null;

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

  async extractTextFromBuffer(
    imageBuffer: Buffer,
    mimeType: string,
    engine: OcrEngine = 'gemini',
    mode: OcrMode = 'highlight'
  ): Promise<string> {
    try {
      return await this.getAdapter(engine).extractText(imageBuffer, mimeType, mode);
    } catch (error) {
      logger.error(`[OcrService][${engine}][${mode}]`, error);
      throw error;
    }
  }
}
