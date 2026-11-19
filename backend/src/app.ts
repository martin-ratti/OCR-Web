import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { logger } from './config/logger';
import { OcrController } from './features/ocr/ocr.controller';
import { createOcrRouter } from './features/ocr/ocr.router';
import { errorHandler } from './middlewares/errorHandler';
import { globalLimiter } from './middlewares/rateLimit';
import { requestId } from './middlewares/requestId';
import { metricsMiddleware, renderMetrics } from './middlewares/metrics';

export interface AppOptions {
  ocrController?: OcrController;
  enableGlobalLimiter?: boolean;
}

function buildHealthPayload() {
  return {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    engines: {
      gemini: Boolean(process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY),
      groq: Boolean(process.env.GROQ_API_KEY ?? env.GROQ_API_KEY),
      local: true,
    },
  };
}

export function createApp(opts: AppOptions = {}): Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(requestId);
  app.use(metricsMiddleware);

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const normalized = origin.replace(/\/+$/, '');
        if (env.ALLOWED_ORIGINS.includes('*') || env.ALLOWED_ORIGINS.includes(normalized)) {
          return cb(null, true);
        }
        logger.warn(
          `[CORS] Rejected origin=${origin} allowed=${JSON.stringify(env.ALLOWED_ORIGINS)}`,
        );
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  if (opts.enableGlobalLimiter !== false) {
    app.use(globalLimiter);
  }

  const handleHealth = (_req: Request, res: Response) => {
    res.status(200).json(buildHealthPayload());
  };

  app.get('/health', handleHealth);
  app.get('/api/health', handleHealth);

  app.get('/metrics', (req, res) => {
    const expectedToken = process.env.METRICS_TOKEN ?? env.METRICS_TOKEN;
    const currentNodeEnv = process.env.NODE_ENV ?? env.NODE_ENV;

    if (expectedToken) {
      const authHeader = req.headers.authorization ?? '';
      if (authHeader !== `Bearer ${expectedToken}`) {
        res.status(403).json({ status: 'error', text: '', warnings: ['Acceso no autorizado a métricas.'] });
        return;
      }
    } else if (currentNodeEnv === 'production') {
      res.status(403).json({
        status: 'error',
        text: '',
        warnings: ['El endpoint de métricas requiere configurar METRICS_TOKEN en producción.'],
      });
      return;
    }

    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.status(200).send(renderMetrics());
  });

  app.use('/api/ocr', createOcrRouter(opts.ocrController));

  app.use(errorHandler);

  return app;
}
