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

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    logger.warn('[Multer]', err.code, err.message);
    res.status(status).json({
      status: 'error',
      text: '',
      warnings: [err.message],
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      status: 'error',
      text: '',
      warnings: [err.message],
    });
    return;
  }

  if (isRateLimitError(err)) {
    const message = (err as Error).message || 'Gemini rate limit reached';
    logger.warn('[RateLimit]', message);
    res.status(429).json({
      status: 'error',
      text: '',
      warnings: [message],
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unknown server error';
  logger.error('[Unhandled]', err);
  res.status(500).json({
    status: 'error',
    text: '',
    warnings: [message],
  });
}
