import { rateLimit } from 'express-rate-limit';

/**
 * Per-IP cap aligned with Gemini 2.5 Flash-Lite free tier:
 * 15 RPM, 1,000 RPD (shared across the whole project).
 * This limit is intentionally conservative because Gemini quota
 * is shared across every client that hits the server.
 */
export const ocrLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ipv6Subnet: 56,
  message: {
    status: 'error',
    text: '',
    warnings: [
      'Demasiadas peticiones en poco tiempo. Esperá un minuto antes de volver a intentar.',
    ],
  },
});

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ipv6Subnet: 56,
  message: {
    status: 'error',
    text: '',
    warnings: ['Demasiadas peticiones. Intentá de nuevo más tarde.'],
  },
});
