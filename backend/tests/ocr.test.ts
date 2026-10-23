import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { OcrController } from '../src/features/ocr/ocr.controller';
import { OcrService, sanitizeModelOutput, type OcrAdapter } from '../src/features/ocr/ocr.service';
import type { OcrMode } from '@ocr-web/shared';

const PNG_FIXTURE = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000150fe8a070000000049454e44ae426082',
  'hex'
);

class StubAdapter implements OcrAdapter {
  public lastMode: OcrMode | undefined;
  constructor(private readonly behavior: 'ok' | 'rate' | 'boom' = 'ok') {}
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

  it('returns 200 and text on success (default engine & mode=highlight)', async () => {
    const stub = new StubAdapter('ok');
    const res = await request(appWith(stub))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'success', text: 'TEXTO RESALTADO' });
    expect(stub.lastMode).toBe('highlight');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('forwards mode=full to adapter', async () => {
    const stub = new StubAdapter('ok');
    const res = await request(appWith(stub, { withGroq: true }))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' })
      .field('engine', 'groq')
      .field('mode', '  FULL ');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'success', text: 'PAGINA COMPLETA' });
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
    const res = await request(appWith(new StubAdapter('ok'), { withGroq: true }))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' })
      .field('engine', 'groq');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'success', text: 'TEXTO RESALTADO' });
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

describe('GET /health and /metrics', () => {
  it('returns health JSON', async () => {
    const res = await request(appWith(new StubAdapter('ok'))).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('exposes Prometheus-style metrics', async () => {
    const app = appWith(new StubAdapter('ok'));
    await request(app).get('/health');
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/ocr_success_total/);
    expect(res.text).toMatch(/http_requests_total/);
  });
});
