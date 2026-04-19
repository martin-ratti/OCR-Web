import { env } from './config/env';
import { logger } from './config/logger';
import { createApp } from './app';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`[Server] Listening on http://localhost:${env.PORT} (env=${env.NODE_ENV})`);
  logger.info(`[CORS] Allowed origins: ${JSON.stringify(env.ALLOWED_ORIGINS)}`);
});
