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
