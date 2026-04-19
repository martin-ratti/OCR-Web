import sharp from 'sharp';

interface HighlightBand {
  hueMin: number;
  hueMax: number;
  satMin: number;
}

const HIGHLIGHT_BANDS: HighlightBand[] = [
  { hueMin: 35, hueMax: 70, satMin: 0.30 },    // yellow fluo
  { hueMin: 70, hueMax: 175, satMin: 0.32 },   // green fluo (cut pastel post-it)
  { hueMin: 280, hueMax: 355, satMin: 0.08 },  // pink / magenta pastel
  { hueMin: 0, hueMax: 25, satMin: 0.08 },     // salmon / pastel rosa wrap
];
const MIN_VALUE = 0.35;
const DARK_THRESHOLD = 125;
const DILATE_RADIUS_H = 45;
const DILATE_RADIUS_V = 16;
const MIN_HIGHLIGHT_COVERAGE = 0.002;
const OUTPUT_DPI = 300;

export interface HighlightMaskResult {
  png: Buffer;
  coverage: number;
  width: number;
  height: number;
}

export async function buildHighlightMaskedImage(
  imageBuffer: Buffer,
): Promise<HighlightMaskResult> {
  const base = sharp(imageBuffer).rotate();
  const { data, info } = await base
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixelCount = width * height;

  const mask = new Uint8Array(pixelCount);
  let highlightPixels = 0;

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    if (isHighlightPixel(r, g, b)) {
      mask[i] = 1;
      highlightPixels++;
    }
  }

  const coverage = highlightPixels / pixelCount;
  const dilated = dilateBoxBinary(mask, width, height, DILATE_RADIUS_H, DILATE_RADIUS_V);

  const out = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    if (!dilated[i]) {
      out[i] = 255;
      continue;
    }
    const idx = i * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i] = gray < DARK_THRESHOLD ? 0 : 255;
  }

  const png = await sharp(out, {
    raw: { width, height, channels: 1 },
  })
    .withMetadata({ density: OUTPUT_DPI })
    .png()
    .toBuffer();

  return { png, coverage, width, height };
}

export function hasEnoughHighlight(coverage: number): boolean {
  return coverage >= MIN_HIGHLIGHT_COVERAGE;
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
    if (h >= band.hueMin && h <= band.hueMax && s >= band.satMin) return true;
  }
  return false;
}

function dilateBoxBinary(
  mask: Uint8Array,
  w: number,
  h: number,
  rH: number,
  rV: number,
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
    for (let k = 0; k <= rV && k < h; k++) if (tmp[k * w + x]) count++;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = count > 0 ? 1 : 0;
      const remIdx = y - rV;
      const addIdx = y + rV + 1;
      if (remIdx >= 0 && tmp[remIdx * w + x]) count--;
      if (addIdx < h && tmp[addIdx * w + x]) count++;
    }
  }

  return out;
}
