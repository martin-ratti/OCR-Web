export type { OcrEngine } from '@ocr-web/shared';
import type { OcrEngine } from '@ocr-web/shared';

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

// Saturación temporal del modelo upstream (Gemini 503 UNAVAILABLE). Distinto de
// cuota agotada: reintentar tiene sentido en segundos, no requiere esperar al
// reset diario. Backend ya devuelve 503 para estos casos; este matcher cubre
// el caso defensivo donde el mensaje llegue sin status code claro.
export function isUpstreamBusyMessage(msg: string | undefined): boolean {
  if (!msg) return false;
  return /UNAVAILABLE|high demand|overloaded|saturado|try again later|503/i.test(msg);
}

export async function processOcr(
  blob: Blob,
  filename: string,
  engine: OcrEngine,
  signal?: AbortSignal,
): Promise<Response> {
  const formData = new FormData();
  formData.append('image', blob, filename);
  formData.append('engine', engine);
  return fetch(`${getApiBase()}/api/ocr/extract`, {
    method: 'POST',
    body: formData,
    signal,
  });
}
