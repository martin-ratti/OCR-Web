import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { logger } from '../config/logger';

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

function isRateLimitError(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  return (
    anyErr?.status === 429 ||
    /429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(anyErr?.message ?? '')
  );
}

// Gemini frecuentemente devuelve 503 UNAVAILABLE ("This model is currently
// experiencing high demand") en horarios pico. Sin esta detección, el error
// caía a "Unhandled" → 500 → cliente NO reintenta. Tratamos esto como
// transitorio y devolvemos 503 para que el cliente entre al loop de backoff.
function isTransientUpstreamError(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  const msg = anyErr?.message ?? '';
  return (
    anyErr?.status === 503 ||
    anyErr?.status === 502 ||
    anyErr?.status === 504 ||
    /503|UNAVAILABLE|high demand|overloaded|try again later|temporarily/i.test(msg)
  );
}

const SAFE_PUBLIC_MESSAGES = {
  rateLimit: 'Límite de uso alcanzado. Probá nuevamente en unos minutos.',
  upstreamBusy: 'El modelo de IA está saturado. Reintentando automáticamente...',
  upstream: 'No pudimos procesar la imagen. Probá de nuevo.',
  badRequest: 'Solicitud inválida.',
  payloadTooLarge: 'La imagen supera el tamaño máximo permitido (5 MB).',
  unsupportedFile: 'Tipo de archivo no soportado.',
  internal: 'Error interno del servidor. Probá de nuevo más tarde.',
} as const;

function safeMulterMessage(err: multer.MulterError): { status: number; message: string } {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return { status: 413, message: SAFE_PUBLIC_MESSAGES.payloadTooLarge };
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
    return { status: 400, message: SAFE_PUBLIC_MESSAGES.badRequest };
  }
  return { status: 400, message: SAFE_PUBLIC_MESSAGES.badRequest };
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const reqId = (req as Request & { requestId?: string }).requestId;
  const idTag = reqId ? `[req=${reqId}] ` : '';

  if (err instanceof multer.MulterError) {
    const { status, message } = safeMulterMessage(err);
    logger.warn(`${idTag}[Multer] code=${err.code} msg=${err.message}`);
    res.status(status).json({ status: 'error', text: '', warnings: [message] });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ status: 'error', text: '', warnings: [err.message] });
    return;
  }

  if (isRateLimitError(err)) {
    const internal = (err as Error).message || 'rate limit';
    logger.warn(`${idTag}[RateLimit] ${internal}`);
    res.status(429).json({
      status: 'error',
      text: '',
      warnings: [SAFE_PUBLIC_MESSAGES.rateLimit],
    });
    return;
  }

  if (isTransientUpstreamError(err)) {
    const internal = (err as Error).message || 'upstream unavailable';
    logger.warn(`${idTag}[UpstreamBusy] ${internal}`);
    res.status(503).json({
      status: 'error',
      text: '',
      warnings: [SAFE_PUBLIC_MESSAGES.upstreamBusy],
    });
    return;
  }

  const internal = err instanceof Error ? err.message : String(err);
  logger.error(`${idTag}[Unhandled]`, internal, err instanceof Error ? err.stack : undefined);
  res.status(500).json({
    status: 'error',
    text: '',
    warnings: [SAFE_PUBLIC_MESSAGES.upstream],
  });
}
