import { isProd } from './env';

type LogArgs = unknown[];

function fmt(level: string, args: LogArgs): LogArgs {
  return [`[${new Date().toISOString()}] [${level}]`, ...args];
}

export const logger = {
  info: (...args: LogArgs) => {
    if (!isProd) console.log(...fmt('INFO', args));
  },
  warn: (...args: LogArgs) => console.warn(...fmt('WARN', args)),
  error: (...args: LogArgs) => console.error(...fmt('ERROR', args)),
};

export function withRequestId(reqId: string | undefined) {
  const tag = reqId ? `[req=${reqId}]` : '';
  return {
    info: (...args: LogArgs) => logger.info(tag, ...args),
    warn: (...args: LogArgs) => logger.warn(tag, ...args),
    error: (...args: LogArgs) => logger.error(tag, ...args),
  };
}
