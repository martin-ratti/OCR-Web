/* eslint-disable */
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { TesseractOcrAdapter } from '../backend/src/features/ocr/ocr.service';
import { buildHighlightMaskedImage } from '../backend/src/features/ocr/highlightMask';

const SAMPLES_DIR = path.resolve('C:/Users/tacon/Downloads/VER');
const OUT_DIR = path.resolve(__dirname, 'tess-out');

async function run() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs
    .readdirSync(SAMPLES_DIR)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();

  const adapter = new TesseractOcrAdapter();
  const results: Array<{ file: string; coverage: number; rotation: number; len: number; preview: string }> = [];

  for (const fname of files) {
    const full = path.join(SAMPLES_DIR, fname);
    const safe = fname.replace(/[^\w.-]/g, '_');
    const buf = fs.readFileSync(full);
    const orientedBuf = await sharp(buf).rotate().toBuffer();

    const { png, coverage, width, height } = await buildHighlightMaskedImage(orientedBuf);
    fs.writeFileSync(path.join(OUT_DIR, `mask_${safe}.png`), png);

    const t0 = Date.now();
    let text = '';
    try {
      text = await adapter.extractText(buf, 'image/jpeg');
    } catch (err) {
      text = `__ERROR__: ${(err as Error).message}`;
    }
    const elapsed = Date.now() - t0;

    fs.writeFileSync(path.join(OUT_DIR, `text_${safe}.txt`), text);

    const preview = text.replace(/\s+/g, ' ').slice(0, 140);
    results.push({
      file: fname,
      coverage: +(coverage * 100).toFixed(3),
      rotation: 0,
      len: text.length,
      preview,
    });
    console.log(`${fname}  cov=${(coverage * 100).toFixed(2)}%  len=${text.length}  ${elapsed}ms  ${width}x${height}`);
    console.log(`  > ${preview}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(results, null, 2));
  console.log('\nDone. Outputs in', OUT_DIR);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
