import path from 'node:path';
import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import Tesseract, { createWorker, type Worker } from 'tesseract.js';
import sharp from 'sharp';
import { env } from '../../config/env';
import { HIGHLIGHT_EXTRACTION_PROMPT, NO_HIGHLIGHT_SENTINEL } from '../../config/prompt';
import { logger } from '../../config/logger';
import type { OcrEngine } from '@ocr-web/shared';
import { buildHighlightMaskedImage, hasEnoughHighlight } from './highlightMask';

const MODEL_ID = 'gemini-2.5-flash-lite';
const GEMINI_TIMEOUT_MS = 60_000;
const OSD_DETECT_WIDTH = 1000;
const OCR_RETRY_CONFIDENCE = 55;

const TESSERACT_CACHE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'tesseract');
if (!fs.existsSync(TESSERACT_CACHE_DIR)) {
  fs.mkdirSync(TESSERACT_CACHE_DIR, { recursive: true });
}
const TESSERACT_WORKER_OPTIONS = {
  cachePath: TESSERACT_CACHE_DIR,
  cacheMethod: 'readWrite' as const,
  gzip: true,
};

export interface OcrAdapter {
  extractText(imageBuffer: Buffer, mimeType: string): Promise<string>;
}

export class GeminiOcrAdapter implements OcrAdapter {
  private ai: GoogleGenAI;

  constructor(apiKey: string | undefined = env.GEMINI_API_KEY) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurada. Usá el motor Tesseract o agregá la key en backend/.env.');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async extractText(imageBuffer: Buffer, mimeType: string): Promise<string> {
    const timeoutId = setTimeout(() => {
      logger.warn(`[Gemini] Request exceeded ${GEMINI_TIMEOUT_MS}ms timeout`);
    }, GEMINI_TIMEOUT_MS);

    const work = this.ai.models.generateContent({
      model: MODEL_ID,
      contents: [
        HIGHLIGHT_EXTRACTION_PROMPT,
        { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
      ],
      config: {
        temperature: 0,
        topP: 0.1,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Gemini timeout after ${GEMINI_TIMEOUT_MS}ms`)),
        GEMINI_TIMEOUT_MS,
      );
    });

    try {
      const response = await Promise.race([work, timeout]);
      return response.text ? response.text.trim() : '';
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

let recognizeWorker: Promise<Worker> | null = null;
let osdWorker: Promise<Worker> | null = null;

async function getRecognizeWorker(): Promise<Worker> {
  if (!recognizeWorker) {
    recognizeWorker = createWorker(['spa', 'eng'], Tesseract.OEM.LSTM_ONLY, TESSERACT_WORKER_OPTIONS).catch((err) => {
      recognizeWorker = null;
      throw err;
    });
  }
  return recognizeWorker;
}

async function getOsdWorker(): Promise<Worker> {
  if (!osdWorker) {
    osdWorker = createWorker('osd', Tesseract.OEM.TESSERACT_ONLY, TESSERACT_WORKER_OPTIONS)
      .then(async (w) => {
        await w.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.OSD_ONLY });
        return w;
      })
      .catch((err) => {
        osdWorker = null;
        throw err;
      });
  }
  return osdWorker;
}

export class TesseractOcrAdapter implements OcrAdapter {
  async extractText(imageBuffer: Buffer, _mimeType: string): Promise<string> {
    const oriented = await sharp(imageBuffer).rotate().toBuffer();
    const rotationDeg = await detectTextRotation(oriented);
    const upright = rotationDeg !== 0
      ? await sharp(oriented).rotate(-rotationDeg, { background: '#ffffff' }).toBuffer()
      : oriented;

    const { png, coverage } = await buildHighlightMaskedImage(upright);
    logger.info(
      `[Tesseract] rotation=${rotationDeg}deg coverage=${(coverage * 100).toFixed(3)}%`,
    );

    if (!hasEnoughHighlight(coverage)) {
      return NO_HIGHLIGHT_SENTINEL;
    }

    const worker = await getRecognizeWorker();
    const first = await worker.recognize(png);
    let page = first.data;
    let confidence = page.confidence ?? 0;
    logger.info(`[Tesseract] conf=${confidence.toFixed(1)} rawLen=${(page.text ?? '').length}`);

    if (confidence < OCR_RETRY_CONFIDENCE) {
      const flipped = await sharp(png).rotate(180).toBuffer();
      const retry = await worker.recognize(flipped);
      const retryConf = retry.data.confidence ?? 0;
      logger.info(`[Tesseract] low-conf retry ${confidence.toFixed(1)} → ${retryConf.toFixed(1)}`);
      if (retryConf > confidence) {
        page = retry.data;
        confidence = retryConf;
      }
    }

    const filtered = extractHighConfidenceText(page);
    const cleaned = cleanOcrText(filtered);
    logger.info(`[Tesseract] filteredLen=${cleaned.length}`);
    return cleaned.length > 0 ? cleaned : NO_HIGHLIGHT_SENTINEL;
  }
}

const MIN_WORD_CONFIDENCE = 60;
const MIN_LINE_CONFIDENCE = 50;
const MIN_LINE_LETTERS = 3;
const MIN_LETTER_RATIO = 0.45;

function extractHighConfidenceText(page: Tesseract.Page): string {
  const blocks = page.blocks;
  if (!blocks || blocks.length === 0) return page.text ?? '';

  const paragraphs: string[] = [];
  for (const block of blocks) {
    for (const para of block.paragraphs) {
      const lines: string[] = [];
      for (const line of para.lines) {
        if ((line.confidence ?? 0) < MIN_LINE_CONFIDENCE) continue;
        const keptWords = line.words
          .filter((w) => (w.confidence ?? 0) >= MIN_WORD_CONFIDENCE)
          .map((w) => w.text.trim())
          .filter((t) => t.length > 0);
        if (keptWords.length === 0) continue;
        const lineText = keptWords.join(' ').trim();
        if (!looksLikeText(lineText)) continue;
        lines.push(lineText);
      }
      if (lines.length > 0) paragraphs.push(lines.join(' '));
    }
  }
  return paragraphs.join('\n\n');
}

function looksLikeText(s: string): boolean {
  const letters = s.match(/\p{L}/gu)?.length ?? 0;
  if (letters < MIN_LINE_LETTERS) return false;
  return letters / s.length >= MIN_LETTER_RATIO;
}

function cleanOcrText(raw: string): string {
  return raw
    .replace(/-\s+(?=\p{L})/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s]+|[\s]+$/g, '');
}

async function detectTextRotation(imageBuffer: Buffer): Promise<number> {
  try {
    const small = await sharp(imageBuffer)
      .resize({ width: OSD_DETECT_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const worker = await getOsdWorker();
    const result = await worker.detect(small);
    const deg = extractOrientationDegrees(result);
    return normalizeRotation(deg);
  } catch (err) {
    logger.info('[Tesseract][OSD] detection failed, skipping rotation', err);
    return 0;
  }
}

function extractOrientationDegrees(result: unknown): number {
  if (!result || typeof result !== 'object') return 0;
  const r = result as Record<string, unknown>;
  const direct = r.orientation_degrees;
  if (typeof direct === 'number') return direct;
  const nested = (r.data as Record<string, unknown> | undefined)?.orientation_degrees;
  if (typeof nested === 'number') return nested;
  return 0;
}

function normalizeRotation(deg: number): number {
  const rounded = Math.round(deg / 90) * 90;
  const mod = ((rounded % 360) + 360) % 360;
  return mod;
}

export class OcrService {
  private readonly overrides: Partial<Record<OcrEngine, OcrAdapter>>;
  private geminiAdapter: OcrAdapter | null = null;
  private tesseractAdapter: OcrAdapter | null = null;

  constructor(adapters?: Partial<Record<OcrEngine, OcrAdapter>>) {
    this.overrides = adapters ?? {};
  }

  private getAdapter(engine: OcrEngine): OcrAdapter {
    if (engine === 'gemini') {
      if (this.overrides.gemini) return this.overrides.gemini;
      if (!this.geminiAdapter) this.geminiAdapter = new GeminiOcrAdapter();
      return this.geminiAdapter;
    }
    if (this.overrides.tesseract) return this.overrides.tesseract;
    if (!this.tesseractAdapter) this.tesseractAdapter = new TesseractOcrAdapter();
    return this.tesseractAdapter;
  }

  async extractTextFromBuffer(
    imageBuffer: Buffer,
    mimeType: string,
    engine: OcrEngine = 'gemini',
  ): Promise<string> {
    try {
      return await this.getAdapter(engine).extractText(imageBuffer, mimeType);
    } catch (error) {
      logger.error(`[OcrService][${engine}]`, error);
      throw error;
    }
  }
}
