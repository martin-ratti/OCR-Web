import { Request, Response, NextFunction } from 'express';

interface Counters {
  httpRequestsTotal: Record<string, number>;
  ocrSuccessTotal: number;
  ocrErrorTotal: number;
  ocrRateLimitTotal: number;
}

const counters: Counters = {
  httpRequestsTotal: {},
  ocrSuccessTotal: 0,
  ocrErrorTotal: 0,
  ocrRateLimitTotal: 0,
};

export function recordOcrSuccess(): void {
  counters.ocrSuccessTotal += 1;
}

export function recordOcrError(rateLimited: boolean): void {
  counters.ocrErrorTotal += 1;
  if (rateLimited) counters.ocrRateLimitTotal += 1;
}

export function resetMetricsForTests(): void {
  counters.httpRequestsTotal = {};
  counters.ocrSuccessTotal = 0;
  counters.ocrErrorTotal = 0;
  counters.ocrRateLimitTotal = 0;
}

export function escapePrometheusLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function normalizeRouteLabel(req: Request): string {
  if (req.route?.path) {
    const base = req.baseUrl || '';
    const routePath = typeof req.route.path === 'string' ? req.route.path : String(req.route.path);
    const full = `${base}${routePath === '/' && base ? '' : routePath}`;
    return full || '/';
  }
  return 'UNMATCHED_ROUTE';
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const routeLabel = normalizeRouteLabel(req);
    const key = `${req.method}\t${routeLabel}\t${res.statusCode}`;
    counters.httpRequestsTotal[key] = (counters.httpRequestsTotal[key] ?? 0) + 1;
  });
  next();
}

export function renderMetrics(): string {
  const lines: string[] = [];
  lines.push('# HELP ocr_success_total OCR successful extractions');
  lines.push('# TYPE ocr_success_total counter');
  lines.push(`ocr_success_total ${counters.ocrSuccessTotal}`);
  lines.push('# HELP ocr_error_total OCR failed extractions');
  lines.push('# TYPE ocr_error_total counter');
  lines.push(`ocr_error_total ${counters.ocrErrorTotal}`);
  lines.push('# HELP ocr_rate_limit_total OCR upstream rate-limit hits');
  lines.push('# TYPE ocr_rate_limit_total counter');
  lines.push(`ocr_rate_limit_total ${counters.ocrRateLimitTotal}`);
  lines.push('# HELP http_requests_total HTTP request count by method+path+status');
  lines.push('# TYPE http_requests_total counter');
  for (const [k, v] of Object.entries(counters.httpRequestsTotal)) {
    const [method, path, status] = k.split('\t');
    lines.push(
      `http_requests_total{method="${escapePrometheusLabel(method ?? '')}",path="${escapePrometheusLabel(path ?? '')}",status="${escapePrometheusLabel(status ?? '')}"} ${v}`
    );
  }
  return lines.join('\n') + '\n';
}
