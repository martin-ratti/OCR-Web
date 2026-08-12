// Browser-side Tesseract.js adapter. Drives the `engine === 'paddle'` UI label
// (kept for backwards compatibility with persisted state) so users can OCR
// locally without burning the shared Gemini quota and without paying for a
// Render instance large enough to run a server-side OCR engine.
//
// Strategy: OCR the full page directly. Earlier versions masked highlighted
// regions only (HSV + Otsu) to match the Gemini "extract highlighted text"
// prompt contract, but real photos from end users had pale/inconsistent
// highlights → mask discarded most of the legible page, dropping similarity
// vs Gemini from ~0.65 to ~0.35. Full-page mode gives ~0.72 sim / 0.83
// word-recall on the same corpus and the user explicitly prefers legibility
// over strict highlight filtering.
//
// Design notes:
//   - One module-level worker is reused across recognitions; spinning a new
//     worker per image would re-download the ~10 MB language model each time.
//   - The worker is auto-terminated after `IDLE_TERMINATE_MS` of inactivity
//     to free the ~150 MB it pins; the next request transparently re-creates it.
//   - `eng` traineddata is loaded alongside `spa` because Spanish notes often
//     mix English technical terms.

import { createWorker, PSM, type Worker } from 'tesseract.js';

const IDLE_TERMINATE_MS = 5 * 60 * 1000;
// 2× (antes 3×): a 3× sobre un canvas de hasta 1600px se generaba una imagen de
// ~4800px que Tesseract procesaba lentísimo y, en fotos de libro nítidas, sin
// ganancia de precisión (a veces peor por ruido de interpolación). 2× sube el
// texto chico de pie de página a un tamaño cómodo para el LSTM sin reventar el
// tiempo de cómputo ni la RAM del worker.
const UPSCALE_FACTOR = 2;
const MAX_INPUT_WIDTH = 1600;

export interface TesseractProgress {
  status: 'loading' | 'recognizing' | 'idle';
  progress: number;
}

type ProgressListener = (p: TesseractProgress) => void;

let workerPromise: Promise<Worker> | null = null;
let lastUsedAt = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const progressListeners = new Set<ProgressListener>();

function emit(p: TesseractProgress): void {
  progressListeners.forEach((fn) => {
    try { fn(p); } catch { /* listener errors are not fatal */ }
  });
}

export function subscribeTesseractProgress(fn: ProgressListener): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

function scheduleIdleTermination(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (Date.now() - lastUsedAt < IDLE_TERMINATE_MS) {
      scheduleIdleTermination();
      return;
    }
    void terminateWorker();
  }, IDLE_TERMINATE_MS);
}

export async function terminateWorker(): Promise<void> {
  if (!workerPromise) return;
  const w = await workerPromise.catch(() => null);
  workerPromise = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (w) {
    try { await w.terminate(); } catch { /* ignore */ }
  }
}

async function getWorker(): Promise<Worker> {
  if (workerPromise) {
    lastUsedAt = Date.now();
    return workerPromise;
  }
  workerPromise = (async () => {
    emit({ status: 'loading', progress: 0 });
    const worker = await createWorker(['spa', 'eng'], 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          emit({ status: 'recognizing', progress: m.progress });
        } else if (typeof m.progress === 'number' && m.progress > 0 && m.progress < 1) {
          emit({ status: 'loading', progress: m.progress });
        }
      },
    });
    await worker.setParameters({
      // AUTO segmentation handles multi-paragraph book pages with headers,
      // footers, and indented blocks better than SINGLE_BLOCK, which assumed
      // a single tightly-packed paragraph (mask-mode worldview).
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    emit({ status: 'idle', progress: 1 });
    lastUsedAt = Date.now();
    scheduleIdleTermination();
    return worker;
  })();
  return workerPromise;
}

const COMMON_SHORT_WORDS = new Set([
  'a','al','ante','b','bajo','cabe','con','contra','cuyo','de','del',
  'desde','donde','durante','e','el','él','en','entre','es','esa',
  'ese','eso','esta','este','esto','fue','ha','han','has','hay','la',
  'las','le','les','lo','los','más','me','mi','mis','mí','no','nos',
  'o','os','para','pero','por','que','qué','se','sé','si','sí','sin',
  'sobre','su','sus','tan','te','ti','tras','tu','tus','tú','un',
  'una','unas','uno','unos','usted','ustedes','va','van','vas','vos',
  'y','ya','yo',
]);

function isReadableLine(line: string): boolean {
  const tokens = line.split(/\s+/).filter((t) => /\p{L}/u.test(t));
  if (tokens.length === 0) return false;
  if (tokens.length === 1) {
    const t = tokens[0].replace(/[^\p{L}À-ɏ]/gu, '');
    return t.length >= 4 || COMMON_SHORT_WORDS.has(t.toLowerCase());
  }
  let readable = 0;
  for (const t of tokens) {
    const lc = t.toLowerCase().replace(/[^\p{L}À-ɏ]/gu, '');
    if (lc.length >= 4) readable++;
    else if (COMMON_SHORT_WORDS.has(lc)) readable++;
  }
  return readable / tokens.length >= 0.45;
}

const SPANISH_TRIGRAMS = new Set([
  'que', 'ent', 'aci', 'ció', 'cio', 'con', 'ado', 'and', 'des', 'est',
  'par', 'ara', 'pro', 'cia', 'nte', 'res', 'tra', 'rec', 'ist',
  'una', 'los', 'las', 'del', 'mas', 'ien', 'sus', 'ue ', 'os ', 'es ',
  'do ', 'as ', 'la ', 'el ', 'en ', 'de ', 'an ', 'un ', 'se ', 'no ',
  'ona', 'ana', 'ora', 'eri', 'eli', 'tal', 'cul', 'ult', 'fac', 'sti',
  'ica', 'ido', 'ada', 'cer', 'ble', 'lib', 'der', 'pen', 'sen', 'ner',
]);

function scoreSpanishness(text: string): { score: number; matches: number; total: number } {
  const lc = text.toLowerCase();
  const total = Math.max(0, lc.length - 2);
  if (total === 0) return { score: 0, matches: 0, total: 0 };
  let matches = 0;
  for (let i = 0; i < total; i++) {
    if (SPANISH_TRIGRAMS.has(lc.substring(i, i + 3))) matches++;
  }
  return { score: matches / total, matches, total };
}

/**
 * Quality score for a single rotation attempt. Replaces the old "trigram density
 * only" heuristic, which was the root cause of the local engine returning
 * garbage: a sideways/upside-down page can score ~0.04 on trigrams by chance and
 * beat the upright pass that the old GOOD_ENOUGH_SPANISHNESS=0.035 threshold
 * accepted, so the adapter would commit to the wrong rotation.
 *
 * Tesseract's own per-word `confidence` is a far stronger orientation signal:
 * upright text reads with high confidence and produces many real words, while
 * rotated text yields short, low-confidence fragments. We combine three signals
 * so no single one can be gamed by noise:
 *   - meanConfidence (0..100): primary — collapses for wrong rotations.
 *   - readableWordRatio: fraction of words that look like real lexemes.
 *   - spanishness: tie-breaker between two otherwise-similar orientations.
 */
interface RotationQuality {
  text: string;
  meanConfidence: number;
  wordCount: number;
  readableWordRatio: number;
  spanishness: number;
  combined: number;
}

interface OcrWord {
  text: string;
  confidence: number;
}

function collectWords(blocks: unknown): OcrWord[] {
  const words: OcrWord[] = [];
  if (!Array.isArray(blocks)) return words;
  for (const block of blocks as Array<{ paragraphs?: unknown }>) {
    const paragraphs = Array.isArray(block?.paragraphs) ? block.paragraphs : [];
    for (const para of paragraphs as Array<{ lines?: unknown }>) {
      const lines = Array.isArray(para?.lines) ? para.lines : [];
      for (const line of lines as Array<{ words?: unknown }>) {
        const ws = Array.isArray(line?.words) ? line.words : [];
        for (const w of ws as Array<{ text?: string; confidence?: number }>) {
          if (typeof w?.text === 'string') {
            words.push({ text: w.text, confidence: typeof w.confidence === 'number' ? w.confidence : 0 });
          }
        }
      }
    }
  }
  return words;
}

function isWordLike(raw: string): boolean {
  const t = raw.toLowerCase().replace(/[^\p{L}À-ɏ]/gu, '');
  if (t.length >= 4) return true;
  return COMMON_SHORT_WORDS.has(t);
}

function computeRotationQuality(text: string, words: OcrWord[]): RotationQuality {
  const wordCount = words.length;
  const meanConfidence = wordCount === 0
    ? 0
    : words.reduce((acc, w) => acc + w.confidence, 0) / wordCount;
  const readableWords = words.filter((w) => isWordLike(w.text)).length;
  const readableWordRatio = wordCount === 0 ? 0 : readableWords / wordCount;
  const spanishness = scoreSpanishness(text).score;

  // Weighted blend. meanConfidence dominates (the orientation discriminator);
  // readableWordRatio guards against high-confidence-but-gibberish; spanishness
  // breaks near-ties. Empirically a correct upright pass on the Mora corpus
  // lands ~0.65+, a wrong 90°/180° pass stays under ~0.35.
  const combined =
    (meanConfidence / 100) * 0.6 +
    readableWordRatio * 0.3 +
    Math.min(1, spanishness / 0.05) * 0.1;

  return { text, meanConfidence, wordCount, readableWordRatio, spanishness, combined };
}

function rotateImageData180(src: ImageData): ImageData {
  const { width, height, data } = src;
  const out = new ImageData(width, height);
  const dst = out.data;
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const j = total - 1 - i;
    const si = i * 4;
    const di = j * 4;
    dst[di] = data[si];
    dst[di + 1] = data[si + 1];
    dst[di + 2] = data[si + 2];
    dst[di + 3] = data[si + 3];
  }
  return out;
}

function rotateImageData90CW(src: ImageData): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(h, w);
  const dst = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = (x * h + (h - 1 - y)) * 4;
      dst[di] = data[si];
      dst[di + 1] = data[si + 1];
      dst[di + 2] = data[si + 2];
      dst[di + 3] = data[si + 3];
    }
  }
  return out;
}

function rotateImageData270CW(src: ImageData): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(h, w);
  const dst = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = ((w - 1 - x) * h + y) * 4;
      dst[di] = data[si];
      dst[di + 1] = data[si + 1];
      dst[di + 2] = data[si + 2];
      dst[di + 3] = data[si + 3];
    }
  }
  return out;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function isHighlighterPixel(r: number, g: number, b: number): boolean {
  const [h, s, l] = rgbToHsl(r, g, b);

  if (l < 20 || l > 96) return false;
  if (s < 10) return false;
  if (s < 20 && l > 78 && (h >= 30 && h <= 55)) return false;

  // Rosa / Fucsia / Magenta
  if ((h >= 275 || h <= 25) && s >= 12 && l >= 30 && l <= 93) return true;
  // Amarillo
  if (h >= 35 && h <= 75 && s >= 18 && l >= 45 && l <= 93) return true;
  // Naranja
  if (h >= 15 && h <= 40 && s >= 18 && l >= 45 && l <= 90) return true;
  // Verde
  if (h >= 75 && h <= 165 && s >= 12 && l >= 35 && l <= 90) return true;
  // Celeste / Azul
  if (h >= 165 && h <= 240 && s >= 12 && l >= 35 && l <= 90) return true;
  // Violeta / Púrpura
  if (h >= 240 && h <= 275 && s >= 12 && l >= 35 && l <= 90) return true;

  return false;
}

interface OcrLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

function collectLines(blocks: unknown): OcrLine[] {
  const lines: OcrLine[] = [];
  if (!Array.isArray(blocks)) return lines;
  for (const block of blocks as Array<{ paragraphs?: unknown }>) {
    const paragraphs = Array.isArray(block?.paragraphs) ? block.paragraphs : [];
    for (const para of paragraphs as Array<{ lines?: unknown }>) {
      const ls = Array.isArray(para?.lines) ? para.lines : [];
      for (const line of ls as Array<{ text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }>) {
        if (typeof line?.text === 'string' && line.text.trim().length > 0 && line.bbox) {
          lines.push({ text: line.text.trim(), bbox: line.bbox });
        }
      }
    }
  }
  return lines;
}

function isBboxHighlighted(
  colorData: ImageData,
  bbox: { x0: number; y0: number; x1: number; y1: number },
  upscale: number
): boolean {
  const w = colorData.width;
  const h = colorData.height;
  const px = colorData.data;

  const minX = Math.max(0, Math.floor(bbox.x0 / upscale));
  const maxX = Math.min(w - 1, Math.ceil(bbox.x1 / upscale));
  const minY = Math.max(0, Math.floor(bbox.y0 / upscale));
  const maxY = Math.min(h - 1, Math.ceil(bbox.y1 / upscale));

  const totalPixels = (maxX - minX + 1) * (maxY - minY + 1);
  if (totalPixels <= 0) return false;

  let highlightCount = 0;
  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * w * 4;
    for (let x = minX; x <= maxX; x++) {
      const idx = rowOffset + x * 4;
      if (isHighlighterPixel(px[idx], px[idx + 1], px[idx + 2])) {
        highlightCount++;
      }
    }
  }

  return (highlightCount / totalPixels) >= 0.04 || highlightCount >= 10;
}

async function fileToImageData(blob: Blob): Promise<{ colorData: ImageData; grayData: ImageData }> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const scale = Math.min(1, MAX_INPUT_WIDTH / srcW);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const colorData = ctx.getImageData(0, 0, w, h);
  const grayData = ctx.getImageData(0, 0, w, h);

  const px = colorData.data;
  const gpx = grayData.data;
  const n = w * h;

  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const g = (0.15 * px[i] + 0.5 * px[i + 1] + 0.35 * px[i + 2]) | 0;
    gray[p] = g;
    hist[g]++;
  }

  const clip = Math.max(1, Math.floor(n * 0.02));
  let lo = 0;
  let hiBound = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc > clip) { lo = v; break; }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc > clip) { hiBound = v; break; }
  }
  const range = Math.max(1, hiBound - lo);

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    let v = ((gray[p] - lo) / range) * 255;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    const g = v | 0;
    gpx[i] = g;
    gpx[i + 1] = g;
    gpx[i + 2] = g;
  }
  return { colorData, grayData };
}

async function imageDataToBlob(imageData: ImageData, upscale: number): Promise<Blob> {
  const w = imageData.width * upscale;
  const h = imageData.height * upscale;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  if (upscale === 1) {
    ctx.putImageData(imageData, 0, 0);
  } else {
    const tmp = document.createElement('canvas');
    tmp.width = imageData.width;
    tmp.height = imageData.height;
    tmp.getContext('2d')!.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmp, 0, 0, w, h);
  }
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, 'image/png'),
  );
  if (!blob) throw new Error('Canvas toBlob failed');
  return blob;
}

const UPRIGHT_CONFIDENCE_SHORTCUT = 0.55;
const ROTATION_WIN_MARGIN = 0.08;

type RotationFn = (src: ImageData) => ImageData;
const ROTATIONS: ReadonlyArray<{ label: string; fn: RotationFn | null }> = [
  { label: '0', fn: null },
  { label: '180', fn: rotateImageData180 },
  { label: '90', fn: rotateImageData90CW },
  { label: '270', fn: rotateImageData270CW },
];

interface RotationResult {
  quality: RotationQuality;
  lines: OcrLine[];
  rotationFn: RotationFn | null;
}

async function recognizeRotation(
  worker: Worker,
  base: ImageData,
  rot: RotationFn | null,
): Promise<RotationResult> {
  const data = rot ? rot(base) : base;
  const blob = await imageDataToBlob(data, UPSCALE_FACTOR);
  const url = URL.createObjectURL(blob);
  try {
    const { data: ocr } = await worker.recognize(url, {}, { text: true, blocks: true });
    const words = collectWords((ocr as { blocks?: unknown }).blocks);
    const lines = collectLines((ocr as { blocks?: unknown }).blocks);
    const quality = computeRotationQuality(ocr.text, words);
    return { quality, lines, rotationFn: rot };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Run the local OCR pipeline on a single File.
 * 1. Decode + downscale + color/grayscale separation.
 * 2. OCR the photo as-is (0°). If it reads with high confidence, commit.
 * 3. Otherwise try the other 3 cardinal rotations.
 * 4. Filter OCR bounding boxes against the color image to keep only highlighted text.
 */
export async function recognizeLocal(file: File): Promise<string> {
  const { colorData, grayData } = await fileToImageData(file);
  const worker = await getWorker();
  lastUsedAt = Date.now();

  const upright = await recognizeRotation(worker, grayData, null);
  let best = upright;

  if (upright.quality.combined < UPRIGHT_CONFIDENCE_SHORTCUT) {
    const threshold = upright.quality.combined + ROTATION_WIN_MARGIN;
    for (const { fn } of ROTATIONS) {
      if (fn === null) continue;
      const r = await recognizeRotation(worker, grayData, fn);
      if (r.quality.combined >= threshold && r.quality.combined > best.quality.combined) {
        best = r;
      }
    }
  }

  lastUsedAt = Date.now();
  scheduleIdleTermination();

  const rotColorData = best.rotationFn ? best.rotationFn(colorData) : colorData;

  const highlightedLines = best.lines.filter((line) =>
    isBboxHighlighted(rotColorData, line.bbox, UPSCALE_FACTOR)
  );

  if (highlightedLines.length === 0) {
    return 'No se detectó texto resaltado en esta imagen.';
  }

  const cleaned = highlightedLines
    .map((l) => l.text)
    .filter((t) => t.length > 0)
    .filter(isReadableLine);

  if (cleaned.length === 0) {
    return 'No se detectó texto resaltado en esta imagen.';
  }

  return cleaned.join('\n').trim();
}
