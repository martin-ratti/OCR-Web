import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { OcrController } from '../src/features/ocr/ocr.controller';
import {
  ConcurrencySemaphore,
  GeminiOcrAdapter,
  GroqOcrAdapter,
  OcrService,
  isRetryableModelError,
  sanitizeModelOutput,
  type OcrAdapter,
} from '../src/features/ocr/ocr.service';
import { escapePrometheusLabel, resetMetricsForTests } from '../src/middlewares/metrics';
import { hasValidImageMagicBytes } from '../src/middlewares/upload';
import type { OcrMode } from '@ocr-web/shared';

const PNG_FIXTURE = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000150fe8a070000000049454e44ae426082',
  'hex'
);

class StubAdapter implements OcrAdapter {
  public lastMode: OcrMode | undefined;
  constructor(
    private readonly behavior: 'ok' | 'rate' | 'boom' = 'ok',
    private readonly modelName: string = 'gemini-3.5-flash-lite'
  ) {}
  getLastModelUsed(): string {
    return this.modelName;
  }
  async extractText(_buf: Buffer, _mime: string, mode?: OcrMode): Promise<string> {
    this.lastMode = mode;
    if (this.behavior === 'rate') {
      const e = new Error('RESOURCE_EXHAUSTED: 429 quota');
      throw e;
    }
    if (this.behavior === 'boom') {
      throw new Error('Internal Gemini SDK trace path /home/secret/key.json');
    }
    return mode === 'full' ? 'PAGINA COMPLETA' : 'TEXTO RESALTADO';
  }
}

function appWith(adapter: OcrAdapter, opts?: { withPaddle?: boolean; withGroq?: boolean }) {
  const overrides: Partial<Record<'gemini' | 'paddle' | 'groq', OcrAdapter>> = { gemini: adapter };
  if (opts?.withPaddle) overrides.paddle = adapter;
  if (opts?.withGroq) overrides.groq = adapter;
  const service = new OcrService(overrides);
  const controller = new OcrController(service);
  return createApp({ ocrController: controller, enableGlobalLimiter: false });
}

describe('POST /api/ocr/extract', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('returns 200, text, and modelUsed on success (default engine & mode=highlight)', async () => {
    const stub = new StubAdapter('ok', 'gemini-3.5-flash-lite');
    const res = await request(appWith(stub))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'success',
      text: 'TEXTO RESALTADO',
      modelUsed: 'gemini-3.5-flash-lite',
    });
    expect(stub.lastMode).toBe('highlight');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('forwards mode=full to adapter', async () => {
    const stub = new StubAdapter('ok', 'qwen/qwen3.8-27b');
    const res = await request(appWith(stub, { withGroq: true }))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' })
      .field('engine', 'groq')
      .field('mode', '  FULL ');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'success',
      text: 'PAGINA COMPLETA',
      modelUsed: 'qwen/qwen3.8-27b',
    });
    expect(stub.lastMode).toBe('full');
  });

  it('rejects invalid mode string with 400', async () => {
    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' })
      .field('mode', 'invalid-mode');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  it('rejects engine=paddle with 410 (motor movido al cliente)', async () => {
    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' })
      .field('engine', 'paddle');
    expect(res.status).toBe(410);
    expect(res.body.status).toBe('error');
  });

  it('still allows engine=paddle when explicitly overridden (DI seam for tests)', async () => {
    const res = await request(appWith(new StubAdapter('ok'), { withPaddle: true }))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' })
      .field('engine', 'paddle');
    expect(res.status).toBe(200);
  });

  it('normalizes engine casing/whitespace', async () => {
    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' })
      .field('engine', '  GEMINI  ');
    expect(res.status).toBe(200);
  });

  it('processes OCR successfully using engine=groq', async () => {
    const res = await request(appWith(new StubAdapter('ok', 'qwen/qwen3.8-27b'), { withGroq: true }))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' })
      .field('engine', 'groq');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'success',
      text: 'TEXTO RESALTADO',
      modelUsed: 'qwen/qwen3.8-27b',
    });
  });

  it('rejects invalid engine string with updated error message', async () => {
    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' })
      .field('engine', 'tesseract');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.warnings[0]).toContain('"gemini" o "groq"');
  });

  it('returns 400 when no file uploaded', async () => {
    const res = await request(appWith(new StubAdapter('ok'))).post('/api/ocr/extract');
    expect(res.status).toBe(400);
  });

  it('returns 415 when uploading unsupported MIME type (e.g. image/svg+xml)', async () => {
    const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf-8');
    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract')
      .attach('image', svgBuf, { filename: 'icon.svg', contentType: 'image/svg+xml' });
    expect(res.status).toBe(415);
    expect(res.body.status).toBe('error');
    expect(res.body.warnings[0]).toMatch(/no soportado/i);
  });

  it('rejects renamed MP4/MOV video with ftyp isom/mp42 brand with 415', async () => {
    // 24-byte ftyp box with major brand "isom" and compatible brand "mp42"
    const mp4Ftyp = Buffer.from(
      '000000186674797069736f6d0000020069736f6d6d703432',
      'hex'
    );
    expect(hasValidImageMagicBytes(mp4Ftyp)).toBe(false);

    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract')
      .attach('image', mp4Ftyp, { filename: 'video.heic', contentType: 'image/heic' });
    expect(res.status).toBe(415);
    expect(res.body.warnings[0]).toMatch(/HEIC\/HEIF válida/i);
  });

  it('accepts valid HEIC ftyp magic bytes (major brand heic or mif1+heic)', async () => {
    const validHeic = Buffer.from(
      '000000186674797068656963000000006d69663168656963',
      'hex'
    );
    expect(hasValidImageMagicBytes(validHeic)).toBe(true);

    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract')
      .attach('image', validHeic, {
        filename: 'iphone.heic',
        contentType: 'application/octet-stream',
      });
    expect(res.status).toBe(200);
  });

  it('rejects file with invalid magic bytes (fake image)', async () => {
    const fakeBuffer = Buffer.from('NOT_AN_IMAGE_FILE_CONTENT_JUST_TEXT', 'utf-8');
    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract')
      .attach('image', fakeBuffer, { filename: 'fake.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.warnings[0]).toMatch(/no es una imagen válida/i);
  });

  it('maps upstream rate-limit to 429 with sanitized message', async () => {
    const res = await request(appWith(new StubAdapter('rate')))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(429);
    expect(res.body.warnings[0]).not.toMatch(/RESOURCE_EXHAUSTED/);
  });

  it('does NOT leak internal error details to client', async () => {
    const res = await request(appWith(new StubAdapter('boom')))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/key\.json|Internal Gemini SDK/);
  });

  it('returns 503 when GEMINI_API_KEY or GROQ_API_KEY is missing', () => {
    expect(() => new GeminiOcrAdapter('')).toThrowError(/GEMINI_API_KEY no configurada/);
    try {
      new GeminiOcrAdapter('');
    } catch (e) {
      expect((e as { status?: number }).status).toBe(503);
    }

    try {
      new GroqOcrAdapter('');
    } catch (e) {
      expect((e as { status?: number }).status).toBe(503);
    }
  });
});

describe('isRetryableModelError & ConcurrencySemaphore', () => {
  it('treats timeouts (502, 504, ETIMEDOUT, AbortError, deadline exceeded) as retryable for lightweight fallback', () => {
    expect(isRetryableModelError({ status: 504, message: 'Gateway Timeout' })).toBe(true);
    expect(isRetryableModelError({ status: 502, message: 'Bad Gateway' })).toBe(true);
    expect(isRetryableModelError({ code: 'ETIMEDOUT', message: 'read ETIMEDOUT' })).toBe(true);
    expect(isRetryableModelError({ name: 'AbortError', message: 'The operation was aborted' })).toBe(
      true
    );
    expect(isRetryableModelError(new Error('DEADLINE_EXCEEDED: deadline exceeded'))).toBe(true);
    expect(isRetryableModelError(new Error('Invalid API key 401'))).toBe(false);
  });

  it('limits concurrent executions with ConcurrencySemaphore', async () => {
    const sem = new ConcurrencySemaphore(2);
    let current = 0;
    let maxObserved = 0;

    const tasks = Array.from({ length: 5 }, () =>
      sem.run(async () => {
        current += 1;
        maxObserved = Math.max(maxObserved, current);
        await new Promise((r) => setTimeout(r, 15));
        current -= 1;
        return 'done';
      })
    );

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(5);
    expect(maxObserved).toBeLessThanOrEqual(2);
  });
});

describe('sanitizeModelOutput', () => {
  it('strips <think> reasoning blocks and code fences', () => {
    const dirty =
      '<think>\nAnalyzing highlighter color...\n</think>\n```text\nArtículo 183 del Código Penal.\n```';
    expect(sanitizeModelOutput(dirty, 'highlight')).toBe('Artículo 183 del Código Penal.');
  });

  it('normalizes quoted sentinel in highlight mode', () => {
    expect(sanitizeModelOutput('"No se detecto texto resaltado en esta imagen"', 'highlight')).toBe(
      'No se detectó texto resaltado en esta imagen.'
    );
  });

  it('removes conversational preambles', () => {
    const raw = 'Aquí tienes la transcripción del texto:\n\nEl delito de estafa requiere ardid.';
    expect(sanitizeModelOutput(raw, 'full')).toBe('El delito de estafa requiere ardid.');
  });
});

describe('GET /health, /api/health and /metrics', () => {
  const prevMetricsToken = process.env.METRICS_TOKEN;

  beforeEach(() => {
    resetMetricsForTests();
    delete process.env.METRICS_TOKEN;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (prevMetricsToken === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = prevMetricsToken;
    process.env.NODE_ENV = 'test';
  });

  it('returns health JSON with engines availability on /health and /api/health', async () => {
    const app = appWith(new StubAdapter('ok'));
    const res1 = await request(app).get('/health');
    expect(res1.status).toBe(200);
    expect(res1.body.status).toBe('ok');
    expect(res1.body.engines).toEqual(
      expect.objectContaining({
        gemini: expect.any(Boolean),
        groq: expect.any(Boolean),
        local: true,
      })
    );

    const res2 = await request(app).get('/api/health');
    expect(res2.status).toBe(200);
    expect(res2.body.engines.local).toBe(true);
  });

  it('normalizes 404 bot scan routes to UNMATCHED_ROUTE and escapes Prometheus labels', async () => {
    const app = appWith(new StubAdapter('ok'));
    await request(app).get('/wp-admin/setup-config.php');
    await request(app).get('/.env.backup');
    await request(app).get('/health');

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/ocr_success_total/);
    expect(res.text).toContain('path="UNMATCHED_ROUTE",status="404"} 2');
    expect(res.text).not.toContain('/wp-admin');
    expect(res.text).not.toContain('/.env.backup');
    expect(escapePrometheusLabel('a"b\\c\nd')).toBe('a\\"b\\\\c\\nd');
  });

  it('protects /metrics with METRICS_TOKEN and blocks unauthenticated access in production', async () => {
    const app = appWith(new StubAdapter('ok'));

    process.env.METRICS_TOKEN = 'secret-token-123';
    const forbidden = await request(app).get('/metrics');
    expect(forbidden.status).toBe(403);

    const authorized = await request(app)
      .get('/metrics')
      .set('Authorization', 'Bearer secret-token-123');
    expect(authorized.status).toBe(200);

    delete process.env.METRICS_TOKEN;
    process.env.NODE_ENV = 'production';
    const prodBlocked = await request(app).get('/metrics');
    expect(prodBlocked.status).toBe(403);
  });
});
