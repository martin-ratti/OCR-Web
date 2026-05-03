import path from 'node:path';
import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import Tesseract, { createWorker, type Worker } from 'tesseract.js';
import sharp from 'sharp';
import { env } from '../../config/env';
import { HIGHLIGHT_EXTRACTION_PROMPT, NO_HIGHLIGHT_SENTINEL } from '../../config/prompt';
import { logger } from '../../config/logger';
import type { OcrEngine } from '@ocr-web/shared';
import { buildHighlightMaskedImage, hasEnoughHighlight, upscaleMask } from './highlightMask';

const MODEL_ID = 'gemini-2.5-flash-lite';
const GEMINI_TIMEOUT_MS = 60_000;
const ROTATION_FAST_PATH_CONF = 78;   // accept rotation 0 result if it looks confident enough
const ROTATION_FAST_PATH_LEN = 80;    // also require some text length to avoid noise pages

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

async function getRecognizeWorker(): Promise<Worker> {
  if (!recognizeWorker) {
    recognizeWorker = createWorker(['spa', 'eng'], Tesseract.OEM.LSTM_ONLY, TESSERACT_WORKER_OPTIONS)
      .then(async (w) => {
        await w.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.AUTO,
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        });
        return w;
      })
      .catch((err) => {
        recognizeWorker = null;
        throw err;
      });
  }
  return recognizeWorker;
}

export class TesseractOcrAdapter implements OcrAdapter {
  async extractText(imageBuffer: Buffer, _mimeType: string): Promise<string> {
    const oriented = await sharp(imageBuffer).rotate().toBuffer();
    const { png, coverage } = await buildHighlightMaskedImage(oriented);
    logger.info(`[Tesseract] coverage=${(coverage * 100).toFixed(3)}%`);

    if (!hasEnoughHighlight(coverage)) {
      return NO_HIGHLIGHT_SENTINEL;
    }

    const worker = await getRecognizeWorker();

    // Phase 1 (scout): cheap OCR on 1x mask across 4 rotations to pick orientation.
    // Fast path: if rot=0 already reads well, skip scout for the other 3.
    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 270, 180];
    let bestRot: 0 | 90 | 180 | 270 = 0;
    let bestScoutScore = -Infinity;

    for (const rot of rotations) {
      const buf = rot === 0 ? png : await sharp(png).rotate(rot).toBuffer();
      const result = await worker.recognize(buf);
      const conf = result.data.confidence ?? 0;
      const txt = (result.data.text ?? '').trim();
      const score = scoreOcrResult(conf, txt.length, txt);
      logger.info(`[Tesseract] scout rot=${rot} conf=${conf.toFixed(1)} len=${txt.length} score=${score.toFixed(1)}`);

      if (score > bestScoutScore) {
        bestScoutScore = score;
        bestRot = rot;
      }

      if (rot === 0 && conf >= ROTATION_FAST_PATH_CONF && txt.length >= ROTATION_FAST_PATH_LEN && hasGoodSpanishRatio(txt)) {
        break;
      }
    }

    // Phase 2 (final): re-run picked rotation at 2x upscale with SINGLE_BLOCK PSM.
    // Image is now upright; SINGLE_BLOCK is far more accurate than AUTO on our
    // segmented mask (AUTO mis-detects column splits and shreds paragraphs).
    const upscaled = await upscaleMask(png, 2);
    const finalBuf = bestRot === 0 ? upscaled : await sharp(upscaled).rotate(bestRot).toBuffer();
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
    const finalResult = await worker.recognize(finalBuf);
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO });
    const bestPage = finalResult.data;
    const bestConf = bestPage.confidence ?? 0;
    const bestLen = (bestPage.text ?? '').trim().length;
    logger.info(`[Tesseract] final rot=${bestRot} conf=${bestConf.toFixed(1)} len=${bestLen}`);

    let cleaned = cleanOcrText(extractHighConfidenceText(bestPage));

    if (cleaned.length === 0 && (bestPage.text ?? '').trim().length > 0) {
      const relaxed = extractRelaxedText(bestPage);
      cleaned = cleanOcrText(relaxed);
      logger.info(`[Tesseract] relaxed fallback len=${cleaned.length}`);
    }

    logger.info(`[Tesseract] finalLen=${cleaned.length}`);
    return cleaned.length > 0 ? cleaned : NO_HIGHLIGHT_SENTINEL;
  }
}

// Score OCR result favouring high confidence AND meaningful Spanish content.
function scoreOcrResult(conf: number, len: number, text: string): number {
  if (conf < 0) return -1;
  const ratio = spanishCharRatio(text);
  const lengthBonus = Math.log10(1 + len) * 8; // diminishing return
  const ratioMul = 0.5 + ratio * 1.5; // 0.5x to 2x multiplier based on Spanish-likeness
  return (conf + lengthBonus) * ratioMul;
}

function hasGoodSpanishRatio(text: string): boolean {
  return spanishCharRatio(text) >= 0.78;
}

function spanishCharRatio(text: string): number {
  if (text.length === 0) return 0;
  const allowed = text.match(/[\p{L}\p{N}\s.,;:¿?¡!()"'\-—«»“”‘’]/gu)?.length ?? 0;
  return allowed / text.length;
}

const MIN_WORD_CONFIDENCE = 60;
const MIN_LINE_CONFIDENCE = 55;
const MIN_LINE_LETTERS = 4;
const MIN_LETTER_RATIO = 0.55;
const MIN_SPANISH_RATIO = 0.65;

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

function extractRelaxedText(page: Tesseract.Page): string {
  const RELAXED_WORD_CONF = 35;
  const RELAXED_LINE_CONF = 25;
  const blocks = page.blocks;
  if (!blocks || blocks.length === 0) return page.text ?? '';

  const paragraphs: string[] = [];
  for (const block of blocks) {
    for (const para of block.paragraphs) {
      const lines: string[] = [];
      for (const line of para.lines) {
        if ((line.confidence ?? 0) < RELAXED_LINE_CONF) continue;
        const keptWords = line.words
          .filter((w) => (w.confidence ?? 0) >= RELAXED_WORD_CONF)
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
  if (letters / s.length < MIN_LETTER_RATIO) return false;
  if (spanishCharRatio(s) < MIN_SPANISH_RATIO) return false;
  // Word-length distribution: real Spanish lines have many 4+ char words.
  // Garbage OCR fragments are dominated by 1–2 char "words" split by junk.
  const words = s.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 2) return false;
  const longWords = words.filter((w) => /\p{L}{4,}/u.test(w)).length;
  if (longWords < 3) return false;
  if (longWords / words.length < 0.40) return false;
  return true;
}

function cleanOcrText(raw: string): string {
  return raw
    .replace(/-\s+(?=\p{L})/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s]+|[\s]+$/g, '');
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
