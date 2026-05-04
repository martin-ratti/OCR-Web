import sharp from 'sharp';

interface HighlightBand {
  hueMin: number;
  hueMax: number;
  satMin: number;
  satMax?: number;
}

const HIGHLIGHT_BANDS: HighlightBand[] = [
  { hueMin: 30, hueMax: 75, satMin: 0.28 },                  // yellow fluo (kept open: real fluo can be very saturated)
  { hueMin: 75, hueMax: 175, satMin: 0.28, satMax: 0.62 },   // green fluo / verde agua — exclude solid post-it green (>0.65 sat)
  { hueMin: 175, hueMax: 215, satMin: 0.20, satMax: 0.60 },  // celeste / blue fluo — exclude solid blue post-its
  { hueMin: 270, hueMax: 355, satMin: 0.16 },                // pink / magenta pastel
  { hueMin: 0, hueMax: 28, satMin: 0.16 },                   // salmon / pastel rosa wrap (skin tones avg ~0.10)
];
const MIN_VALUE = 0.40;          // brightness floor — excludes dark pen ink
const MAX_DARKNESS_FOR_HIGHLIGHT_BG = 0.20; // skin/wood is darker, exclude
const DILATE_RADIUS_H = 55;
const DILATE_RADIUS_UP = 34;     // push above underline to capture text sitting on top
const DILATE_RADIUS_DOWN = 14;   // small downward to catch full-block highlight tails
const MIN_HIGHLIGHT_COVERAGE = 0.0012; // allow thin pink underlines (was 0.002)
const OUTPUT_DPI = 300;
const OTSU_FLOOR = 95;           // never threshold above/below sane bounds
const OTSU_CEIL = 175;

export interface HighlightMaskResult {
  png: Buffer;
  coverage: number;
  width: number;
  height: number;
}

export async function buildHighlightMaskedImage(
  imageBuffer: Buffer,
): Promise<HighlightMaskResult> {
  // .rotate() applies any EXIF orientation; .normalise() expands tonal range so
  // that text/highlight contrast is consistent regardless of camera exposure.
  const base = sharp(imageBuffer).rotate().normalise();
  const { data, info } = await base
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixelCount = width * height;

  const mask = new Uint8Array(pixelCount);
  const satMap = new Float32Array(pixelCount);
  let highlightPixels = 0;

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
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

  // First pass: compute grayscale only inside the dilated mask.
  const gray = new Uint8Array(pixelCount);
  const histogram = new Uint32Array(256);
  let maskedPixels = 0;
  for (let i = 0; i < pixelCount; i++) {
    if (!dilated[i]) continue;
    const idx = i * channels;
    const g = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) | 0;
    gray[i] = g;
    histogram[g]++;
    maskedPixels++;
  }

  // Adaptive threshold via Otsu over masked region only — separates marker-tinted
  // background from text strokes regardless of paper hue or lighting.
  const otsu = computeOtsuThreshold(histogram, maskedPixels);
  const threshold = Math.max(OTSU_FLOOR, Math.min(OTSU_CEIL, otsu));

  const out = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    if (!dilated[i]) {
      out[i] = 255;
      continue;
    }
    out[i] = gray[i] < threshold ? 0 : 255;
  }

  const png = await sharp(out, {
    raw: { width, height, channels: 1 },
  })
    .withMetadata({ density: OUTPUT_DPI })
    .png()
    .toBuffer();

  return { png, coverage, width, height };
}

export async function upscaleMask(png: Buffer, factor = 2): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const w = (meta.width ?? 0) * factor;
  const h = (meta.height ?? 0) * factor;
  // After upscale we apply a mild unsharp to crispen edges that the lanczos
  // interpolation softens, then a 2-px median to suppress speckle noise that
  // OCR engines tend to read as stray punctuation.
  return sharp(png)
    .resize(w, h, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.7, m1: 0.6, m2: 1.0 })
    .median(1)
    .png()
    .toBuffer();
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

export function hasEnoughHighlight(coverage: number): boolean {
  return coverage >= MIN_HIGHLIGHT_COVERAGE;
}

function pixelSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  if (max === 0) return 0;
  const min = Math.min(r, g, b);
  return (max - min) / max;
}

function isHighlightPixel(r: number, g: number, b: number): boolean {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const v = max;
  if (v < MIN_VALUE) return false;
  if (min < MAX_DARKNESS_FOR_HIGHLIGHT_BG) return false; // dark min channel = ink/skin/wood, not translucent highlighter
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

// Drop blobs that look like post-its or stickers: roughly square (aspect < 1.6
// in dominant orientation) AND large enough to not be a stray dot. Highlighter
// strokes are always elongated horizontal/vertical bands.
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
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let area = 0;
      let satSum = 0;
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
  const POSTIT_MIN_DIM = minDim * 0.06;            // any side ≥6% of short dim qualifies as "big"
  const HIGHLIGHT_ASPECT_MIN = 2.0;                // marker strokes are clearly elongated
  const TINY_NOISE_AREA = 40;
  const SOLID_FILL_RATIO = 0.50;
  const HIGH_SAT_THRESHOLD = 0.62;                 // hard wall: only deep solid colors (post-its); yellow fluo on paper averages ~0.50
  const SIGNIFICANT_BLOB_AREA_FRACTION = 0.003;    // 0.3% of page
  const MEGA_BLOB_AREA_FRACTION = 0.10;            // any blob >10% of page is not a marker stroke
  const TOP_EDGE_FRACTION = 0.04;                  // blob touching top 4% of page edge…
  const TOP_BAND_FRACTION = 0.30;                  // …and entirely within top 30% → post-it overflow, not highlight
  const totalPixels = w * h;

  const debug = process.env.HIGHLIGHT_DEBUG === '1';
  const kept: Array<{ label: number; bw: number; bh: number; area: number; aspect: number; fill: number; avgSat: number; minX: number; minY: number }> = [];
  const dropped: Array<{ reason: string; bw: number; bh: number; area: number; aspect: number; fill: number; avgSat: number; minX: number; minY: number }> = [];

  for (const [label, bb] of blobs) {
    const bw = bb.maxX - bb.minX + 1;
    const bh = bb.maxY - bb.minY + 1;
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    const fill = bb.area / (bw * bh);
    const avgSat = bb.satSum / bb.area;

    if (bb.area < TINY_NOISE_AREA) continue;

    // Failsafe: any blob covering >10% of the page is not a marker stroke — it's
    // background haze (skin/wood/wall) catching the loose pink/salmon hue bands.
    if (bb.area > totalPixels * MEGA_BLOB_AREA_FRACTION) {
      if (debug) dropped.push({ reason: 'mega-blob', bw, bh, area: bb.area, aspect, fill, avgSat, minX: bb.minX, minY: bb.minY });
      continue;
    }

    // Drop blobs anchored to the top edge AND entirely above the body of the page.
    // These are post-it/sticker overflows photographed sticking out of the book.
    if (bb.minY < h * TOP_EDGE_FRACTION && bb.maxY < h * TOP_BAND_FRACTION && bb.area > totalPixels * 0.005) {
      if (debug) dropped.push({ reason: 'top-postit', bw, bh, area: bb.area, aspect, fill, avgSat, minX: bb.minX, minY: bb.minY });
      continue;
    }

    // Top 7% strip is always page-margin or sticker territory, never primary text.
    // Drop any blob that lives entirely there — it's noise that OCRs as garbage prefix chars.
    if (bb.maxY < h * 0.07) {
      if (debug) dropped.push({ reason: 'top-strip', bw, bh, area: bb.area, aspect, fill, avgSat, minX: bb.minX, minY: bb.minY });
      continue;
    }

    // Drop solid square-ish blobs (post-its, stickers).
    if (
      bw > POSTIT_MIN_DIM &&
      bh > POSTIT_MIN_DIM &&
      aspect < HIGHLIGHT_ASPECT_MIN &&
      fill > SOLID_FILL_RATIO
    ) {
      if (debug) dropped.push({ reason: 'square-solid', bw, bh, area: bb.area, aspect, fill, avgSat, minX: bb.minX, minY: bb.minY });
      continue;
    }

    // Drop large high-saturation blobs regardless of shape — solid color object,
    // not a translucent marker stroke (those average lower sat because of paper bleed-through).
    if (bb.area > totalPixels * SIGNIFICANT_BLOB_AREA_FRACTION && avgSat > HIGH_SAT_THRESHOLD && fill > 0.45) {
      if (debug) dropped.push({ reason: 'high-sat', bw, bh, area: bb.area, aspect, fill, avgSat, minX: bb.minX, minY: bb.minY });
      continue;
    }

    if (debug) kept.push({ label, bw, bh, area: bb.area, aspect, fill, avgSat, minX: bb.minX, minY: bb.minY });

    for (let y = bb.minY; y <= bb.maxY; y++) {
      for (let x = bb.minX; x <= bb.maxX; x++) {
        const idx = y * w + x;
        if (labels[idx] === label) out[idx] = 1;
      }
    }
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log(`[highlightMask] kept=${kept.length} dropped=${dropped.length}`);
    for (const k of kept.sort((a, b) => b.area - a.area).slice(0, 12)) {
      // eslint-disable-next-line no-console
      console.log(`  KEEP bw=${k.bw} bh=${k.bh} area=${k.area} aspect=${k.aspect.toFixed(2)} fill=${k.fill.toFixed(2)} avgSat=${k.avgSat.toFixed(2)} @${k.minX},${k.minY}`);
    }
    for (const d of dropped.sort((a, b) => b.area - a.area).slice(0, 12)) {
      // eslint-disable-next-line no-console
      console.log(`  DROP[${d.reason}] bw=${d.bw} bh=${d.bh} area=${d.area} aspect=${d.aspect.toFixed(2)} fill=${d.fill.toFixed(2)} avgSat=${d.avgSat.toFixed(2)} @${d.minX},${d.minY}`);
    }
  }

  return out;
}

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

  // Asymmetric vertical: a highlight pixel at y0 spreads to y0-rUp..y0+rDown.
  // For output[y]=1 we need any tmp pixel in [y-rDown, y+rUp].
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
