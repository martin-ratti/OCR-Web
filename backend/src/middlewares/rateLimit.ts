import { rateLimit } from 'express-rate-limit';

/**
 * Per-IP cap. Old value 12 RPM se ajustaba al límite Gemini (15 RPM).
 * Ahora soportamos Groq (30 RPM) además de Gemini, así que subimos a 25 RPM:
 * deja headroom para clientes legítimos del motor Groq sin abrir la puerta a abuso.
 * Gemini sigue siendo el cuello de botella real para ese motor (su propio 429
 * dispara antes que este limiter).
 */
export const ocrLimiter = rateLimit({
  windowMs: 60_000,
  limit: 25,
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
