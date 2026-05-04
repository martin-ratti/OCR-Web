import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import sharp from 'sharp';
import Ocr, { type Line } from '@gutenye/ocr-node';
import { NO_HIGHLIGHT_SENTINEL } from '../../config/prompt';
import { logger } from '../../config/logger';
import type { OcrAdapter } from './ocr.service';
import { buildHighlightMaskedImage, hasEnoughHighlight, upscaleMask } from './highlightMask';
import { spanishSplitWords } from './spanishWordSplit';

const MODELS_DIR = path.resolve(process.cwd(), 'models', 'paddle');
const DETECTION_PATH = path.join(MODELS_DIR, 'det.onnx');
const RECOGNITION_PATH = path.join(MODELS_DIR, 'rec.onnx');
const DICTIONARY_PATH = path.join(MODELS_DIR, 'dict.txt');

const PADDLE_UPSCALE_FACTOR = 3;
const MIN_LINE_CONFIDENCE = 0.55;

let ocrInstance: Promise<Ocr> | null = null;

async function getOcrInstance(): Promise<Ocr> {
  if (!ocrInstance) {
    for (const p of [DETECTION_PATH, RECOGNITION_PATH, DICTIONARY_PATH]) {
      if (!fs.existsSync(p)) {
        throw new Error(
          `Paddle model file missing: ${p}. Run "pnpm --filter backend models:download".`,
        );
      }
    }
    ocrInstance = Ocr.create({
      models: {
        detectionPath: DETECTION_PATH,
        recognitionPath: RECOGNITION_PATH,
        dictionaryPath: DICTIONARY_PATH,
      },
    }).catch((err) => {
      ocrInstance = null;
      throw err;
    });
  }
  return ocrInstance;
}

async function writeTempPng(buf: Buffer): Promise<string> {
  const file = path.join(os.tmpdir(), `paddle-${crypto.randomUUID()}.png`);
  await fs.promises.writeFile(file, buf);
  return file;
}

async function safeUnlink(file: string): Promise<void> {
  try {
    await fs.promises.unlink(file);
  } catch {
    // best effort cleanup; ignore
  }
}

export class PaddleOcrAdapter implements OcrAdapter {
  async extractText(imageBuffer: Buffer, _mimeType: string): Promise<string> {
    const oriented = await sharp(imageBuffer).rotate().toBuffer();
    const { png, coverage } = await buildHighlightMaskedImage(oriented);
    logger.info(`[Paddle] coverage=${(coverage * 100).toFixed(3)}%`);

    if (!hasEnoughHighlight(coverage)) {
      return NO_HIGHLIGHT_SENTINEL;
    }

    const upscaled = await upscaleMask(png, PADDLE_UPSCALE_FACTOR);
    const tmp = await writeTempPng(upscaled);
    try {
      const ocr = await getOcrInstance();
      const lines: Line[] = await ocr.detect(tmp);
      const ordered = sortLinesReadingOrder(lines).filter(
        (l) => (l.mean ?? 0) >= MIN_LINE_CONFIDENCE && l.text.trim().length > 0,
      );
      logger.info(`[Paddle] detected=${lines.length} kept=${ordered.length}`);
      // PP-OCRv4 latin model dict has no space token, so each line comes back
      // run-together. spanishSplitWords restores word boundaries via DP over
      // a Spanish frequency list before joining.
      const joined = ordered
        .map((l) => spanishSplitWords(l.text.trim()))
        .join('\n');
      return joined.length > 0 ? joined : NO_HIGHLIGHT_SENTINEL;
    } finally {
      await safeUnlink(tmp);
    }
  }
}

// Sort detected text lines by top-Y of their bounding polygon, then by X. The
// PaddleOCR detector emits lines in arbitrary order; this restores natural
// reading order for the joined output.
function sortLinesReadingOrder(lines: Line[]): Line[] {
  return [...lines].sort((a, b) => {
    const ay = boxTop(a.box);
    const by = boxTop(b.box);
    if (Math.abs(ay - by) > 12) return ay - by;
    return boxLeft(a.box) - boxLeft(b.box);
  });
}

function boxTop(box: number[][] | undefined): number {
  if (!box || box.length === 0) return 0;
  return Math.min(...box.map((p) => p[1]));
}

function boxLeft(box: number[][] | undefined): number {
  if (!box || box.length === 0) return 0;
  return Math.min(...box.map((p) => p[0]));
}
