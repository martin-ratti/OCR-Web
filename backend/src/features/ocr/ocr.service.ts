import { GoogleGenAI } from '@google/genai';
import Tesseract from 'tesseract.js';
import { env } from '../../config/env';
import { HIGHLIGHT_EXTRACTION_PROMPT } from '../../config/prompt';
import { logger } from '../../config/logger';
import type { OcrEngine } from './ocr.schema';

const MODEL_ID = 'gemini-2.5-flash-lite';
const TESSERACT_LANGS = 'spa+eng';

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
    const { data } = await Tesseract.recognize(imageBuffer, TESSERACT_LANGS);
    return (data.text ?? '').trim();
  }
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
