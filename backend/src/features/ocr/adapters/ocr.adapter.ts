import type { OcrMode } from '@ocr-web/shared';
import {
  HIGHLIGHT_EXTRACTION_PROMPT,
  FULL_PAGE_EXTRACTION_PROMPT,
  NO_HIGHLIGHT_SENTINEL,
} from '../../../config/prompt';

export interface OcrExtractionResult {
  text: string;
  modelUsed: string;
}

export interface OcrAdapter {
  extractText(imageBuffer: Buffer, mimeType: string, mode?: OcrMode): Promise<string | OcrExtractionResult>;
  getLastModelUsed?(): string | undefined;
}

export const USER_INSTRUCTION: Record<OcrMode, string> = {
  highlight: 'Extraé solo el texto con marcador resaltador.',
  full: 'Transcribí literalmente todo el texto visible.',
};

export function getSystemPrompt(mode: OcrMode): string {
  return mode === 'full' ? FULL_PAGE_EXTRACTION_PROMPT : HIGHLIGHT_EXTRACTION_PROMPT;
}

/**
 * Semáforo ligero en memoria para limitar la cantidad de solicitudes simultáneas
 * hacia una API externa (ej. Gemini Free Tier con límite estricto de RPM).
 */
export class ConcurrencySemaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return this.createRelease();
    }

    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
    this.active += 1;
    return this.createRelease();
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
      const next = this.queue.shift();
      if (next) next();
    };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
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

export function isRetryableModelError(err: unknown): boolean {
  const anyErr = err as { status?: number; code?: string; name?: string; message?: string };
  const s = anyErr?.status;
  const code = anyErr?.code ?? '';
  const name = anyErr?.name ?? '';
  const m = anyErr?.message ?? '';
  return (
    s === 429 ||
    s === 502 ||
    s === 503 ||
    s === 504 ||
    s === 404 ||
    code === 'ETIMEDOUT' ||
    name === 'AbortError' ||
    /429|502|503|504|404|ETIMEDOUT|AbortError|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|deadline exceeded|timeout|timed out|quota|rate limit|high demand|overloaded|not found|no longer available/i.test(
      m
    )
  );
}
