/* eslint-disable */
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import Tesseract, { createWorker } from 'tesseract.js';
import { buildHighlightMaskedImage, upscaleMask } from '../backend/src/features/ocr/highlightMask';

const TARGET = process.argv[2] ?? 'WhatsApp Image 2026-05-01 at 23.27.20.jpeg';
const SAMPLES_DIR = path.resolve('C:/Users/tacon/Downloads/VER');
const CACHE = path.resolve(__dirname, '../backend/node_modules/.cache/tesseract');

const PSMS: Array<{ name: string; psm: any }> = [
  { name: 'AUTO', psm: Tesseract.PSM.AUTO },
  { name: 'SINGLE_BLOCK', psm: Tesseract.PSM.SINGLE_BLOCK },
  { name: 'SINGLE_COLUMN', psm: Tesseract.PSM.SINGLE_COLUMN },
  { name: 'SPARSE_TEXT', psm: Tesseract.PSM.SPARSE_TEXT },
];

async function run() {
  const buf = fs.readFileSync(path.join(SAMPLES_DIR, TARGET));
  const oriented = await sharp(buf).rotate().toBuffer();
  const { png } = await buildHighlightMaskedImage(oriented);
  const upscaled = await upscaleMask(png, 2);

  for (const { name, psm } of PSMS) {
    const w = await createWorker(['spa', 'eng'], Tesseract.OEM.LSTM_ONLY, {
      cachePath: CACHE,
      cacheMethod: 'readWrite',
      gzip: true,
    });
    await w.setParameters({
      tessedit_pageseg_mode: psm,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    const t0 = Date.now();
    const r = await w.recognize(upscaled);
    const elapsed = Date.now() - t0;
    const txt = (r.data.text ?? '').trim();
    console.log(`\n=== PSM ${name} (${psm}) — conf=${r.data.confidence} elapsed=${elapsed}ms ===`);
    console.log(txt.slice(0, 400));
    await w.terminate();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
