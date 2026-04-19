import express, { Express } from 'express';
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

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/metrics', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.status(200).send(renderMetrics());
  });

  app.use('/api/ocr', createOcrRouter(opts.ocrController));

  app.use(errorHandler);

  return app;
}
