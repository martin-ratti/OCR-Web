/* eslint-disable */
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { buildHighlightMaskedImage } from '../backend/src/features/ocr/highlightMask';

process.env.HIGHLIGHT_DEBUG = '1';

const TARGET = process.argv[2] ?? 'WhatsApp Image 2026-05-01 at 23.27.20.jpeg';
const SAMPLES_DIR = path.resolve('C:/Users/tacon/Downloads/VER');
const OUT_DIR = path.resolve(__dirname, 'tess-out');

async function run() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const full = path.join(SAMPLES_DIR, TARGET);
  const safe = TARGET.replace(/[^\w.-]/g, '_');
  const buf = fs.readFileSync(full);
  const orientedBuf = await sharp(buf).rotate().toBuffer();
  console.log(`-- ${TARGET} --`);
  const { png, coverage, width, height } = await buildHighlightMaskedImage(orientedBuf);
  console.log(`coverage=${(coverage * 100).toFixed(3)}%  ${width}x${height}`);
  fs.writeFileSync(path.join(OUT_DIR, `dbg_mask_${safe}.png`), png);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
