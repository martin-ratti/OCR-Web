export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
  return raw.replace(/\/+$/, '');
}

export class RateLimitError extends Error {
  constructor(message = 'RateLimit') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function isRateLimitMessage(msg: string | undefined): boolean {
  if (!msg) return false;
  return /RESOURCE_EXHAUSTED|quota|exhausted|rate limit|429/i.test(msg);
}
