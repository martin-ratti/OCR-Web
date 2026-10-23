export type { OcrEngine, OcrMode } from '@ocr-web/shared';
import type { OcrEngine, OcrMode } from '@ocr-web/shared';

export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
  return raw.replace(/\/+$/, '');
}

export class RateLimitError extends Error {
  constructor(message = 'RateLimit') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function isRateLimitMessage(msg: string | undefined): boolean {
  if (!msg) return false;
  return /RESOURCE_EXHAUSTED|quota|exhausted|rate limit|429/i.test(msg);
}

export function isUpstreamBusyMessage(msg: string | undefined): boolean {
  if (!msg) return false;
  return /UNAVAILABLE|high demand|overloaded|saturado|try again later|503|504/i.test(msg);
}

export async function processOcr(
  blob: Blob,
  filename: string,
  engine: OcrEngine,
  mode: OcrMode = 'highlight',
  signal?: AbortSignal
): Promise<Response> {
  const formData = new FormData();
  formData.append('image', blob, filename);
  formData.append('engine', engine);
  formData.append('mode', mode);
  return fetch(`${getApiBase()}/api/ocr/extract`, {
    method: 'POST',
    body: formData,
    signal,
  });
}
