import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { OcrController } from '../src/features/ocr/ocr.controller';
import { OcrService, type OcrAdapter } from '../src/features/ocr/ocr.service';

const PNG_FIXTURE = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000150fe8a070000000049454e44ae426082',
  'hex',
);

class StubAdapter implements OcrAdapter {
  constructor(private readonly behavior: 'ok' | 'rate' | 'boom' = 'ok') {}
  async extractText(): Promise<string> {
    if (this.behavior === 'rate') {
      const e = new Error('RESOURCE_EXHAUSTED: 429 quota');
      throw e;
    }
    if (this.behavior === 'boom') {
      throw new Error('Internal Gemini SDK trace path /home/secret/key.json');
    }
    return 'TEXTO RESALTADO';
  }
}

function appWith(adapter: OcrAdapter, opts?: { withPaddle?: boolean }) {
  const overrides: Partial<Record<'gemini' | 'paddle', OcrAdapter>> = { gemini: adapter };
  if (opts?.withPaddle) overrides.paddle = adapter;
  const service = new OcrService(overrides);
  const controller = new OcrController(service);
  return createApp({ ocrController: controller, enableGlobalLimiter: false });
}

describe('POST /api/ocr/extract', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('returns 200 and text on success (default engine)', async () => {
    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'success', text: 'TEXTO RESALTADO' });
    expect(res.headers['x-request-id']).toBeTruthy();
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

  it('rejects invalid engine string', async () => {
    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract')
      .attach('image', PNG_FIXTURE, { filename: 'a.png', contentType: 'image/png' })
      .field('engine', 'tesseract');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  it('returns 400 when no file uploaded', async () => {
    const res = await request(appWith(new StubAdapter('ok')))
      .post('/api/ocr/extract');
    expect(res.status).toBe(400);
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
