import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { HIGHLIGHT_EXTRACTION_PROMPT } from '../../config/prompt';
import { logger } from '../../config/logger';

const MODEL_ID = 'gemini-2.5-flash-lite';

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

export class OcrService {
  constructor(private readonly adapter: OcrAdapter = new GeminiOcrAdapter()) {}

  async extractTextFromBuffer(imageBuffer: Buffer, mimeType: string): Promise<string> {
    try {
      return await this.adapter.extractText(imageBuffer, mimeType);
    } catch (error) {
      logger.error('[OcrService]', error);
      throw error;
    }
  }
}
