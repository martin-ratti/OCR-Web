import { GoogleGenAI } from '@google/genai';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { env } from '../../config/env';
import { HIGHLIGHT_EXTRACTION_PROMPT, NO_HIGHLIGHT_SENTINEL } from '../../config/prompt';
import { logger } from '../../config/logger';
import type { OcrEngine } from './ocr.schema';
import { buildHighlightMaskedImage, hasEnoughHighlight } from './highlightMask';

const MODEL_ID = 'gemini-2.5-flash-lite';
const TESSERACT_LANGS = 'spa+eng';
const OSD_DETECT_WIDTH = 1000;
const OCR_RETRY_CONFIDENCE = 55;

export interface OcrAdapter {
  extractText(imageBuffer: Buffer, mimeType: string): Promise<string>;
}

export class GeminiOcrAdapter implements OcrAdapter {
  private ai: GoogleGenAI;

  constructor(apiKey: string = env.GEMINI_API_KEY) {
    this.ai = new GoogleGenAI({ apiKey, apiVersion: 'v1' });
  }

  async extractText(imageBuffer: Buffer, mimeType: string): Promise<string> {
    const response = await this.ai.models.generateContent({
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
    return response.text ? response.text.trim() : '';
  }
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

    const first = await Tesseract.recognize(png, TESSERACT_LANGS);
    let text = (first.data.text ?? '').trim();
    let confidence = first.data.confidence ?? 0;

    if (confidence < OCR_RETRY_CONFIDENCE) {
      const flipped = await sharp(png).rotate(180).toBuffer();
      const retry = await Tesseract.recognize(flipped, TESSERACT_LANGS);
      const retryConf = retry.data.confidence ?? 0;
      logger.info(`[Tesseract] low-conf retry ${confidence.toFixed(1)} → ${retryConf.toFixed(1)}`);
      if (retryConf > confidence) {
        text = (retry.data.text ?? '').trim();
        confidence = retryConf;
      }
    }

    return text.length > 0 ? text : NO_HIGHLIGHT_SENTINEL;
  }
}

async function detectTextRotation(imageBuffer: Buffer): Promise<number> {
  try {
    const small = await sharp(imageBuffer)
      .resize({ width: OSD_DETECT_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const result: unknown = await Tesseract.detect(small);
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
  private readonly adapters: Record<OcrEngine, OcrAdapter>;

  constructor(adapters?: Partial<Record<OcrEngine, OcrAdapter>>) {
    this.adapters = {
      gemini: adapters?.gemini ?? new GeminiOcrAdapter(),
      tesseract: adapters?.tesseract ?? new TesseractOcrAdapter(),
    };
  }

  async extractTextFromBuffer(
    imageBuffer: Buffer,
    mimeType: string,
    engine: OcrEngine = 'gemini',
  ): Promise<string> {
    try {
      return await this.adapters[engine].extractText(imageBuffer, mimeType);
    } catch (error) {
      logger.error(`[OcrService][${engine}]`, error);
      throw error;
    }
  }
}
