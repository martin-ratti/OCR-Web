import { env } from './config/env';
import { logger } from './config/logger';
import { createApp } from './app';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`[Server] Listening on http://localhost:${env.PORT} (env=${env.NODE_ENV})`);
  logger.info(`[CORS] Allowed origins: ${JSON.stringify(env.ALLOWED_ORIGINS)}`);
});

let shuttingDown = false;

function handleShutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[Server] Recibida señal ${signal}, cerrando servidor de forma ordenada...`);

  const forceExitTimer = setTimeout(() => {
    logger.warn('[Server] Tiempo de cierre agotado, forzando salida.');
    process.exit(1);
  }, 15_000);
  forceExitTimer.unref();

  server.close((err) => {
    clearTimeout(forceExitTimer);
    if (err) {
      logger.error('[Server] Error al cerrar servidor:', err);
      process.exit(1);
    }
    logger.info('[Server] Conexiones cerradas limpiamente.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
