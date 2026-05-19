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
const UPSCALE_FACTOR = 3;
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

/**
 * Decode a File/Blob, respect EXIF orientation, downscale to MAX_INPUT_WIDTH,
 * and convert to grayscale ImageData. Grayscale (not binary) gives Tesseract
 * room to discriminate stroke darkness — global Otsu binarisation at this
 * stage can collapse faded ink and was a 5-10% accuracy hit in benchmarks.
 */
async function fileToGrayImageData(blob: Blob): Promise<ImageData> {
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
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) | 0;
    px[i] = g;
    px[i + 1] = g;
    px[i + 2] = g;
  }
  return data;
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

const GOOD_ENOUGH_SPANISHNESS = 0.035;

type RotationFn = (src: ImageData) => ImageData;
const ROTATIONS: ReadonlyArray<{ label: string; fn: RotationFn | null }> = [
  { label: '0', fn: null },
  { label: '180', fn: rotateImageData180 },
  { label: '90', fn: rotateImageData90CW },
  { label: '270', fn: rotateImageData270CW },
];

async function recognizeRotation(
  worker: Worker,
  base: ImageData,
  rot: RotationFn | null,
): Promise<{ text: string; score: ReturnType<typeof scoreSpanishness> }> {
  const data = rot ? rot(base) : base;
  const blob = await imageDataToBlob(data, UPSCALE_FACTOR);
  const url = URL.createObjectURL(blob);
  try {
    const { data: ocr } = await worker.recognize(url);
    return { text: ocr.text, score: scoreSpanishness(ocr.text) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Run the local OCR pipeline on a single File.
 * 1. Decode + downscale + grayscale.
 * 2. Try 4 cardinal rotations (book photos often arrive sideways from WhatsApp,
 *    which strips EXIF orientation). Keep the one scoring highest on Spanish
 *    trigrams; early-exit if the first pass is clearly clean.
 * 3. Strip per-line garbage and join.
 *
 * Edge cases:
 *   - If the image really has no Spanish text (a blank page or a different
 *     language) the best score will stay under MIN_SPANISHNESS and we still
 *     return whatever Tesseract gave us. Returning a sentinel here would hide
 *     real OCR output from users whose pages are in English or contain mostly
 *     equations — both legitimate cases for a law-textbook reader.
 */
export async function recognizeLocal(file: File): Promise<string> {
  const gray = await fileToGrayImageData(file);
  const worker = await getWorker();
  lastUsedAt = Date.now();

  let bestText = '';
  let bestScore = { score: -1, matches: 0, total: 0 };

  for (const { fn } of ROTATIONS) {
    const r = await recognizeRotation(worker, gray, fn);
    if (r.score.score > bestScore.score) {
      bestScore = r.score;
      bestText = r.text;
    }
    if (bestScore.score >= GOOD_ENOUGH_SPANISHNESS) break;
    if (bestScore.total < 30) break;
  }

  lastUsedAt = Date.now();
  scheduleIdleTermination();

  const cleaned = bestText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter(isReadableLine);

  return cleaned.join('\n').trim();
}
