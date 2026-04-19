import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { logger } from './config/logger';
import ocrRouter from './features/ocr/ocr.router';
import { errorHandler } from './middlewares/errorHandler';
import { globalLimiter } from './middlewares/rateLimit';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const normalized = origin.replace(/\/+$/, '');
      if (env.ALLOWED_ORIGINS.includes('*') || env.ALLOWED_ORIGINS.includes(normalized)) {
        return cb(null, true);
      }
      logger.warn(`[CORS] Rejected origin=${origin} allowed=${JSON.stringify(env.ALLOWED_ORIGINS)}`);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(globalLimiter);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/ocr', ocrRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`[Server] Listening on http://localhost:${env.PORT} (env=${env.NODE_ENV})`);
  logger.info(`[CORS] Allowed origins: ${JSON.stringify(env.ALLOWED_ORIGINS)}`);
});
