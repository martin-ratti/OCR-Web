// Browser-side port of backend/src/features/ocr/highlightMask.ts.
//
// Builds a binary mask of highlighted regions (marker / fluorescent pen) using
// the same HSV bands and shape filtering as the server-side Sharp pipeline,
// then bakes the mask onto the source image so non-highlighted pixels are
// flattened to white before OCR. This keeps Tesseract focused on the same
// text the Gemini prompt extracts, preserving the dual-engine highlight
// contract (`NO_HIGHLIGHT_SENTINEL` semantics).

interface HighlightBand {
  hueMin: number;
  hueMax: number;
  satMin: number;
  satMax?: number;
}

const HIGHLIGHT_BANDS: HighlightBand[] = [
  { hueMin: 30, hueMax: 75, satMin: 0.20 },
  { hueMin: 75, hueMax: 175, satMin: 0.20, satMax: 0.65 },
  { hueMin: 175, hueMax: 215, satMin: 0.16, satMax: 0.62 },
  // Pink/magenta highlighter on white prints as low-sat (~0.05-0.18) hues
  // around 300-345°. satMin 0.05 captura rosa pastel muy claro de marcadores
  // tipo "milky pink" sin meter piel/madera (esos quedan 10-25° red-orange).
  // Validado con muestras reales que antes caían en sentinel.
  { hueMin: 270, hueMax: 355, satMin: 0.05 },
  { hueMin: 0, hueMax: 18, satMin: 0.16 },
];

const MIN_VALUE = 0.40;
const MAX_DARKNESS_FOR_HIGHLIGHT_BG = 0.20;
// Dilation horizontal 70px (antes 55): cubre gaps que el marcador deja entre
// palabras en libros A5/A4 escaneados a 1600px ancho. Captura trailing letters
// que el stroke salta sin meter texto no resaltado adyacente.
const DILATE_RADIUS_H = 70;
const DILATE_RADIUS_UP = 34;
const DILATE_RADIUS_DOWN = 14;
// 0.0006 (antes 0.0012): muestras reales con marcador rosa pastel en bordes
// solamente caían bajo el umbral viejo y devolvían sentinel sin intentar OCR.
// Falso-positivo aceptable: si Tesseract no encuentra texto legible, igual
// filtrado por isReadableLine retorna sentinel limpio al final.
const MIN_HIGHLIGHT_COVERAGE = 0.0006;
const OTSU_FLOOR = 95;
const OTSU_CEIL = 175;
// After dilation, fill horizontal gaps within each row between the first and
// last masked column. Highlighter strokes drawn over print are usually
// discontinuous (the marker skips letters) — without this fill, Tesseract
// receives broken-up runs and produces fragmented output. We also extend the
// fill margin slightly so trailing letters that the stroke missed still survive.
const ROWFILL_MIN_RUN_PX = 30;
const ROWFILL_PAD_PX = 18;

export interface MaskedImageResult {
  /** RGBA ImageData of the masked grayscale image (text=black on white, masked-out=white). */
  imageData: ImageData;
  /** Fraction of original pixels classified as highlighted (pre-dilation). */
  coverage: number;
  width: number;
  height: number;
}

export function hasEnoughHighlight(coverage: number): boolean {
  return coverage >= MIN_HIGHLIGHT_COVERAGE;
}

/**
 * Decode a File/Blob into a canvas-ready ImageBitmap, respecting EXIF
 * orientation, and produce an ImageData buffer at the bitmap's native
 * resolution (already auto-rotated by createImageBitmap).
 */
async function fileToImageData(blob: Blob): Promise<{ data: ImageData; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = ctx.getImageData(0, 0, width, height);
  return { data, width, height };
}

/**
 * Apply a contrast-stretch (channel-wise normalisation) so highlight pixels
 * end up consistently identifiable regardless of the original camera
 * exposure. Matches the `.normalise()` step of the Sharp pipeline.
 */
function normalizeChannels(pixels: Uint8ClampedArray): void {
  let rMin = 255, rMax = 0;
  let gMin = 255, gMax = 0;
  let bMin = 255, bMax = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    if (b < bMin) bMin = b; if (b > bMax) bMax = b;
  }
  const stretch = (v: number, min: number, max: number) =>
    max <= min ? v : ((v - min) * 255) / (max - min);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = clamp255(stretch(pixels[i], rMin, rMax));
    pixels[i + 1] = clamp255(stretch(pixels[i + 1], gMin, gMax));
    pixels[i + 2] = clamp255(stretch(pixels[i + 2], bMin, bMax));
  }
}

function clamp255(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v | 0;
}

function pixelSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  if (max === 0) return 0;
  const min = Math.min(r, g, b);
  return (max - min) / max;
}

function isHighlightPixel(r: number, g: number, b: number): boolean {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (max < MIN_VALUE) return false;
  if (min < MAX_DARKNESS_FOR_HIGHLIGHT_BG) return false;
  const s = max === 0 ? 0 : d / max;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  for (const band of HIGHLIGHT_BANDS) {
    if (h < band.hueMin || h > band.hueMax) continue;
    if (s < band.satMin) continue;
    if (band.satMax !== undefined && s > band.satMax) continue;
    return true;
  }
  return false;
}

/**
 * Drop blobs that are not highlighter strokes:
 *   - tiny noise (<40 px)
 *   - solid square stickers / post-its
 *   - mega-blobs (skin/wood/wall background)
 *   - top-edge post-it overflows
 */
function filterShapeComponents(
  mask: Uint8Array,
  satMap: Float32Array,
  w: number,
  h: number,
): Uint8Array {
  const labels = new Int32Array(w * h);
  const out = new Uint8Array(w * h);
  const stack: number[] = [];
  let nextLabel = 1;
  const blobs = new Map<
    number,
    { minX: number; minY: number; maxX: number; maxY: number; area: number; satSum: number }
  >();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx] || labels[idx] !== 0) continue;
      const label = nextLabel++;
      stack.length = 0;
      stack.push(idx);
      labels[idx] = label;
      let minX = x, minY = y, maxX = x, maxY = y, area = 0, satSum = 0;
      while (stack.length > 0) {
        const cur = stack.pop()!;
        area++;
        satSum += satMap[cur];
        const cy = (cur / w) | 0;
        const cx = cur - cy * w;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;
        if (cx > 0) {
          const n = cur - 1;
          if (mask[n] && labels[n] === 0) { labels[n] = label; stack.push(n); }
        }
        if (cx < w - 1) {
          const n = cur + 1;
          if (mask[n] && labels[n] === 0) { labels[n] = label; stack.push(n); }
        }
        if (cy > 0) {
          const n = cur - w;
          if (mask[n] && labels[n] === 0) { labels[n] = label; stack.push(n); }
        }
        if (cy < h - 1) {
          const n = cur + w;
          if (mask[n] && labels[n] === 0) { labels[n] = label; stack.push(n); }
        }
      }
      blobs.set(label, { minX, minY, maxX, maxY, area, satSum });
    }
  }

  const minDim = Math.min(w, h);
  const POSTIT_MIN_DIM = minDim * 0.06;
  const HIGHLIGHT_ASPECT_MIN = 2.0;
  const TINY_NOISE_AREA = 40;
  const SOLID_FILL_RATIO = 0.50;
  const HIGH_SAT_THRESHOLD = 0.62;
  const SIGNIFICANT_BLOB_AREA_FRACTION = 0.003;
  const MEGA_BLOB_AREA_FRACTION = 0.10;
  const TOP_EDGE_FRACTION = 0.04;
  const TOP_BAND_FRACTION = 0.30;
  const totalPixels = w * h;

  for (const [label, bb] of blobs) {
    const bw = bb.maxX - bb.minX + 1;
    const bh = bb.maxY - bb.minY + 1;
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    const fill = bb.area / (bw * bh);
    const avgSat = bb.satSum / bb.area;

    if (bb.area < TINY_NOISE_AREA) continue;
    if (bb.area > totalPixels * MEGA_BLOB_AREA_FRACTION) continue;
    if (bb.minY < h * TOP_EDGE_FRACTION && bb.maxY < h * TOP_BAND_FRACTION && bb.area > totalPixels * 0.005) continue;
    if (bb.maxY < h * 0.07) continue;
    if (
      bw > POSTIT_MIN_DIM &&
      bh > POSTIT_MIN_DIM &&
      aspect < HIGHLIGHT_ASPECT_MIN &&
      fill > SOLID_FILL_RATIO
    ) continue;
    if (bb.area > totalPixels * SIGNIFICANT_BLOB_AREA_FRACTION && avgSat > HIGH_SAT_THRESHOLD && fill > 0.45) continue;

    for (let y = bb.minY; y <= bb.maxY; y++) {
      for (let x = bb.minX; x <= bb.maxX; x++) {
        const idx = y * w + x;
        if (labels[idx] === label) out[idx] = 1;
      }
    }
  }
  return out;
}

/**
 * Box-dilate the mask horizontally `rH` pixels each side, vertically asymmetric
 * `[rDown, rUp]` to grab text sitting above an underlining stroke.
 */
function dilateBoxBinary(
  mask: Uint8Array,
  w: number,
  h: number,
  rH: number,
  rUp: number,
  rDown: number,
): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let count = 0;
    for (let k = 0; k <= rH && k < w; k++) if (mask[row + k]) count++;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = count > 0 ? 1 : 0;
      const remIdx = x - rH;
      const addIdx = x + rH + 1;
      if (remIdx >= 0 && mask[row + remIdx]) count--;
      if (addIdx < w && mask[row + addIdx]) count++;
    }
  }

  for (let x = 0; x < w; x++) {
    let count = 0;
    const initialEnd = Math.min(rUp, h - 1);
    for (let k = 0; k <= initialEnd; k++) if (tmp[k * w + x]) count++;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = count > 0 ? 1 : 0;
      const remIdx = y - rDown;
      const addIdx = y + rUp + 1;
      if (remIdx >= 0 && tmp[remIdx * w + x]) count--;
      if (addIdx < h && tmp[addIdx * w + x]) count++;
    }
  }
  return out;
}

/**
 * For every row, if any pixel is masked-in, fill the span between the first
 * and last masked column (plus a small pad). This closes the per-row gaps
 * that highlighter strokes leave on print: the marker often skips ascenders
 * and word boundaries, so even after dilation the mask has 5-15px holes that
 * fragment Tesseract's line. Rows with very short masked runs (<RUN_PX) are
 * skipped so isolated specks of color do not pull the entire row in.
 */
function rowFillHorizontal(mask: Uint8Array, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let first = -1;
    let last = -1;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first < 0 || last - first < ROWFILL_MIN_RUN_PX) continue;
    const lo = Math.max(0, first - ROWFILL_PAD_PX);
    const hi = Math.min(w - 1, last + ROWFILL_PAD_PX);
    for (let x = lo; x <= hi; x++) mask[row + x] = 1;
  }
}

function computeOtsuThreshold(histogram: Uint32Array, total: number): number {
  if (total === 0) return 130;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 130;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Build a high-contrast binary image where only highlighted-region text
 * survives. Outside the dilated mask, pixels become solid white. Inside,
 * we threshold via Otsu (clamped) so marker tint is removed and ink is
 * preserved as black-on-white — Tesseract performs significantly better on
 * binarised text than on color photos.
 */
export async function buildMaskedImageData(blob: Blob): Promise<MaskedImageResult> {
  const { data: imageData, width, height } = await fileToImageData(blob);
  const px = imageData.data;
  normalizeChannels(px);

  const pixelCount = width * height;
  const mask = new Uint8Array(pixelCount);
  const satMap = new Float32Array(pixelCount);
  let highlightPixels = 0;

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = px[idx], g = px[idx + 1], b = px[idx + 2];
    const sat = pixelSaturation(r, g, b);
    if (isHighlightPixel(r, g, b)) {
      mask[i] = 1;
      satMap[i] = sat;
      highlightPixels++;
    }
  }

  const coverage = highlightPixels / pixelCount;
  const filtered = filterShapeComponents(mask, satMap, width, height);
  const dilated = dilateBoxBinary(
    filtered,
    width,
    height,
    DILATE_RADIUS_H,
    DILATE_RADIUS_UP,
    DILATE_RADIUS_DOWN,
  );

  rowFillHorizontal(dilated, width, height);

  const gray = new Uint8Array(pixelCount);
  const histogram = new Uint32Array(256);
  let maskedPixels = 0;
  for (let i = 0; i < pixelCount; i++) {
    if (!dilated[i]) continue;
    const idx = i * 4;
    const g = (0.299 * px[idx] + 0.587 * px[idx + 1] + 0.114 * px[idx + 2]) | 0;
    gray[i] = g;
    histogram[g]++;
    maskedPixels++;
  }
  const otsu = computeOtsuThreshold(histogram, maskedPixels);
  const threshold = Math.max(OTSU_FLOOR, Math.min(OTSU_CEIL, otsu));

  const out = new ImageData(width, height);
  const outPx = out.data;
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    let v: number;
    if (!dilated[i]) v = 255;
    else v = gray[i] < threshold ? 0 : 255;
    outPx[idx] = v;
    outPx[idx + 1] = v;
    outPx[idx + 2] = v;
    outPx[idx + 3] = 255;
  }
  return { imageData: out, coverage, width, height };
}

/**
 * Convenience: render the masked ImageData onto a canvas, optionally upscaled,
 * and return a Blob (image/png) for handing to Tesseract. Upscaling text 2-3×
 * before OCR is one of the highest-leverage preprocessing tricks for the
 * Tesseract LSTM engine — it was trained on ~30+ px x-height glyphs.
 */
export async function maskedImageDataToBlob(
  imageData: ImageData,
  upscale: number = 1,
): Promise<Blob> {
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
