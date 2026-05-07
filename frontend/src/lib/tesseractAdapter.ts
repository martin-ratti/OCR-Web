// Browser-side Tesseract.js adapter. Drives the `engine === 'paddle'` UI label
// (kept for backwards compatibility with persisted state) so users can OCR
// locally without burning the shared Gemini quota and without paying for a
// Render instance large enough to run a server-side OCR engine.
//
// Design notes:
//   - One module-level worker is reused across recognitions; spinning a new
//     worker per image would re-download the ~10 MB language model each time.
//   - `createWorker` lazy-loads on first call and exposes a progress callback
//     so the UI can show "Cargando motor local 47%..." during the initial fetch.
//   - The worker is auto-terminated after `IDLE_TERMINATE_MS` of inactivity
//     to free the ~150 MB it pins; the next request transparently re-creates it.
//   - The `eng` traineddata is loaded alongside `spa` because Tesseract benefits
//     from a polyglot dictionary on highlighted notes that mix Spanish text
//     with English technical terms (e.g. "interface", "API").

import { createWorker, PSM, type Worker } from 'tesseract.js';
import { buildMaskedImageData, hasEnoughHighlight, maskedImageDataToBlob } from './highlightMaskCanvas';

const NO_HIGHLIGHT_SENTINEL = 'No se detectó texto resaltado en esta imagen.';
const IDLE_TERMINATE_MS = 5 * 60 * 1000;
const UPSCALE_FACTOR = 3;

export interface TesseractProgress {
  /** Discrete phase, useful to show different copy ("downloading" vs "recognising"). */
  status: 'loading' | 'recognizing' | 'idle';
  /** 0..1 within the current phase. */
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

/**
 * Lazy-create a worker pre-configured for Spanish + English with parameters
 * tuned for highlighted hand-marked text:
 *   - PSM 6 (single block) handles paragraph-style highlighted notes well.
 *   - LSTM-only engine (OEM 1) — the legacy Tesseract 3 engine still ships in
 *     the wasm bundle but is significantly worse on photographed text.
 *   - Preserve interword spaces so we don't fight the line joiner.
 *   - Tighten the character whitelist? Skip — the highlighted text often
 *     contains punctuation and digits, and whitelisting harms accents.
 */
async function getWorker(): Promise<Worker> {
  if (workerPromise) {
    lastUsedAt = Date.now();
    return workerPromise;
  }
  workerPromise = (async () => {
    emit({ status: 'loading', progress: 0 });
    const worker = await createWorker(['spa', 'eng'], 1, {
      logger: (m: { status: string; progress: number }) => {
        // tesseract.js emits messages such as "loading language traineddata"
        // (during init) and "recognizing text" (during recognize). Map both
        // to a coarse status the UI can render.
        if (m.status === 'recognizing text') {
          emit({ status: 'recognizing', progress: m.progress });
        } else if (typeof m.progress === 'number' && m.progress > 0 && m.progress < 1) {
          emit({ status: 'loading', progress: m.progress });
        }
      },
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      // user_defined_dpi avoids the "Estimating resolution as N" warning that
      // Tesseract logs when it cannot read DPI from the image header. Setting
      // it explicitly also helps the LSTM engine pick a sensible scale.
      user_defined_dpi: '300',
    });
    emit({ status: 'idle', progress: 1 });
    lastUsedAt = Date.now();
    scheduleIdleTermination();
    return worker;
  })();
  return workerPromise;
}

/**
 * Lightweight readability heuristic to drop OCR garbage lines: counts how many
 * tokens look like real Spanish words. Mirrors `isReadableSpanishLine` in the
 * server-side Paddle adapter so users see the same quality bar regardless of
 * engine. Tesseract is more accurate than Paddle on accented text but still
 * emits gibberish on edge artifacts (binding shadows, photo borders).
 */
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
  // Single-token lines are kept only if the token is reasonably long: a
  // 3-letter blob alone is almost always OCR debris.
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

/**
 * Frequency of common Spanish letter trigrams. Real Spanish text scores
 * markedly higher than upside-down OCR'd Spanish (the latter produces lots of
 * uppercase blobs and rare accent positions). This is the orientation oracle.
 */
const SPANISH_TRIGRAMS = new Set([
  'que', 'ent', 'aci', 'ció', 'cio', 'con', 'ado', 'and', 'des', 'est',
  'par', 'ara', 'pro', 'cia', 'nte', 'res', 'tra', 'rec', 'ent', 'ist',
  'una', 'los', 'las', 'del', 'mas', 'ien', 'sus', 'ue ', 'os ', 'es ',
  'do ', 'as ', 'la ', 'el ', 'en ', 'de ', 'an ', 'un ', 'se ', 'no ',
  'ona', 'ana', 'ora', 'eri', 'eli', 'tal', 'cul', 'ult', 'fac', 'sti',
  'ica', 'ido', 'ada', 'cer', 'ble', 'lib', 'der', 'pen', 'sen', 'ner',
]);

/**
 * Score how Spanish-like the recognized text looks: ratio of common Spanish
 * trigrams found in the lowercased text. Used to decide if a 180° re-OCR is
 * needed (book photos often have no EXIF orientation tag, so the page can
 * come in upside-down). Trigrams beat the per-line readability heuristic
 * because upside-down OCR garbage often produces tokens that *look* word-like
 * (4+ letters) but contain no real Spanish letter sequences.
 */
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
 * Rotate an ImageData 180° in-place via a fresh canvas. Cheap CPU op compared
 * to a Tesseract recognize (~3s vs ~30s).
 */
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

/**
 * Run the local OCR pipeline on a single File.
 *
 * 1. Build the highlight mask in Canvas (HSV banding + shape filter + Otsu
 *    threshold). Returns the masked image as a binary PNG.
 * 2. If coverage is below the minimum, short-circuit with the same sentinel
 *    string the Gemini path uses, so downstream UI behaviour is identical.
 * 3. Hand the masked PNG to Tesseract upscaled `UPSCALE_FACTOR×` for better
 *    glyph resolution.
 * 4. If the first pass produces mostly garbage (Spanish-likeness < threshold),
 *    rotate the masked image 180° and retry — book photos often lack EXIF
 *    orientation tags, so an upside-down shot would otherwise yield gibberish.
 * 5. Strip per-line OCR garbage and join.
 */
// Spanish trigram density on real text typically ~0.05-0.10; upside-down
// OCR garbage scores ~0.005-0.02. Threshold splits the two cleanly.
const MIN_SPANISHNESS = 0.030;

export async function recognizeLocal(file: File): Promise<string> {
  const masked = await buildMaskedImageData(file);
  if (!hasEnoughHighlight(masked.coverage)) {
    return NO_HIGHLIGHT_SENTINEL;
  }
  const worker = await getWorker();
  lastUsedAt = Date.now();

  const firstBlob = await maskedImageDataToBlob(masked.imageData, UPSCALE_FACTOR);
  const firstUrl = URL.createObjectURL(firstBlob);
  let primary: string;
  let primaryScore: { score: number; matches: number; total: number };
  try {
    const { data } = await worker.recognize(firstUrl);
    primary = data.text;
    primaryScore = scoreSpanishness(primary);
  } finally {
    URL.revokeObjectURL(firstUrl);
  }

  // If the page might be upside-down, run a second pass on the rotated mask
  // and keep whichever recognized text scored higher.
  if (primaryScore.score < MIN_SPANISHNESS && primaryScore.total >= 30) {
    const rotated = rotateImageData180(masked.imageData);
    const rotBlob = await maskedImageDataToBlob(rotated, UPSCALE_FACTOR);
    const rotUrl = URL.createObjectURL(rotBlob);
    try {
      const { data: rotData } = await worker.recognize(rotUrl);
      const rotScore = scoreSpanishness(rotData.text);
      if (rotScore.score > primaryScore.score) {
        primary = rotData.text;
        primaryScore = rotScore;
      }
    } finally {
      URL.revokeObjectURL(rotUrl);
    }
  }

  lastUsedAt = Date.now();
  scheduleIdleTermination();

  const cleaned = primary
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter(isReadableLine);

  const joined = cleaned.join('\n').trim();
  return joined.length > 0 ? joined : NO_HIGHLIGHT_SENTINEL;
}
