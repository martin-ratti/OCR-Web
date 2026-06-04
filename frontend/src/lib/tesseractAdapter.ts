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

/**
 * Decode a File/Blob, respect EXIF orientation, downscale to MAX_INPUT_WIDTH,
 * and convert to a contrast-normalised grayscale ImageData.
 *
 * Two deliberate choices for highlighter-heavy book photos:
 *   - Channel weighting leans on green+blue, not the BT.601 luma. Warm
 *     highlighters (orange/yellow/pink, the most common in the user's notes)
 *     are bright in red, so a red-weighted luma washes the black ink under the
 *     marker into mid-grey and tanks recall on exactly the words the user cared
 *     enough to highlight. Green/blue keep that ink dark.
 *   - A gentle percentile contrast stretch (not Otsu binarisation) pulls the
 *     paper toward white and the ink toward black without collapsing faded
 *     strokes. Global Otsu here was a 5-10% accuracy hit in earlier benchmarks,
 *     so we stay in grayscale and just widen the histogram.
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
  const n = w * h;

  // Pass 1: highlighter-aware grayscale + histogram for the stretch.
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    // 0.15·R + 0.5·G + 0.35·B: down-weights red so warm highlighter fill does
    // not brighten the ink beneath it.
    const g = (0.15 * px[i] + 0.5 * px[i + 1] + 0.35 * px[i + 2]) | 0;
    gray[p] = g;
    hist[g]++;
  }

  // Pass 2: find 2nd/98th percentile bounds and stretch to [0, 255]. Clipping
  // the tails keeps a few dark specks or a glossy highlight from anchoring the
  // range and flattening the rest.
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

// Si la primera pasada (0°, la orientación nativa de la foto) ya supera este
// umbral combinado, la imagen está derecha y NO probamos rotaciones: ahorra 3
// pasadas de OCR (~3-6 s) en el caso común. Las fotos de WhatsApp del usuario
// vienen derechas, así que este early-exit es el camino feliz.
const UPRIGHT_CONFIDENCE_SHORTCUT = 0.55;
// Margen mínimo que una rotación debe superar a 0° para que la creamos. Sin
// esto, ruido marginal podía "ganarle" a la orientación correcta por centésimas
// (el bug original con GOOD_ENOUGH_SPANISHNESS=0.035). Preferimos la foto tal
// como vino salvo evidencia fuerte de que está rotada.
const ROTATION_WIN_MARGIN = 0.08;

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
): Promise<RotationQuality> {
  const data = rot ? rot(base) : base;
  const blob = await imageDataToBlob(data, UPSCALE_FACTOR);
  const url = URL.createObjectURL(blob);
  try {
    // `blocks: true` expone confidence por palabra; sin esto solo tendríamos el
    // string plano y volveríamos a depender de los trigramas.
    const { data: ocr } = await worker.recognize(url, {}, { text: true, blocks: true });
    const words = collectWords((ocr as { blocks?: unknown }).blocks);
    return computeRotationQuality(ocr.text, words);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Run the local OCR pipeline on a single File.
 * 1. Decode + downscale + grayscale.
 * 2. OCR the photo as-is (0°). If it reads with high confidence, commit — the
 *    common case (WhatsApp photos arrive upright) costs a single pass.
 * 3. Otherwise try the other 3 cardinal rotations and keep the orientation with
 *    the best *combined* quality (mean Tesseract confidence + readable-word
 *    ratio + Spanish trigrams), but only switch away from 0° if a rotation
 *    beats it by ROTATION_WIN_MARGIN. This is the fix for the "local engine
 *    returns garbage" bug: the old code picked by trigram density alone, so a
 *    rotated noisy pass could win over the correct upright one.
 * 4. Strip per-line garbage and join.
 *
 * Edge cases:
 *   - A genuinely non-Spanish or equation-heavy page still returns whatever
 *     Tesseract read at its best orientation. Returning a sentinel here would
 *     hide real OCR output from English/math pages — both legitimate for a
 *     law-textbook reader.
 */
export async function recognizeLocal(file: File): Promise<string> {
  const gray = await fileToGrayImageData(file);
  const worker = await getWorker();
  lastUsedAt = Date.now();

  // First pass at the photo's native orientation.
  const upright = await recognizeRotation(worker, gray, null);
  let best = upright;

  // Only spend time on rotations if the upright pass looks dubious.
  if (upright.combined < UPRIGHT_CONFIDENCE_SHORTCUT) {
    // A rotation is only trusted if it beats the upright pass by a clear margin;
    // otherwise we keep the photo as it came (avoids the old false-rotation bug).
    const threshold = upright.combined + ROTATION_WIN_MARGIN;
    for (const { fn } of ROTATIONS) {
      if (fn === null) continue; // 0° already done.
      const r = await recognizeRotation(worker, gray, fn);
      if (r.combined >= threshold && r.combined > best.combined) {
        best = r;
      }
    }
  }

  lastUsedAt = Date.now();
  scheduleIdleTermination();

  const cleaned = best.text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter(isReadableLine);

  return cleaned.join('\n').trim();
}
