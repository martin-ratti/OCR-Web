#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(__dirname, '..', 'models', 'paddle');

const FILES = [
  {
    name: 'det.onnx',
    url: 'https://huggingface.co/monkt/paddleocr-onnx/resolve/main/detection/v3/det.onnx',
  },
  {
    name: 'rec.onnx',
    url: 'https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/latin/rec.onnx',
  },
  {
    name: 'dict.txt',
    url: 'https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/latin/dict.txt',
  },
];

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(res.body, fs.createWriteStream(dest));
}

async function main() {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  for (const f of FILES) {
    const dest = path.join(MODELS_DIR, f.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`[skip] ${f.name} already present`);
      continue;
    }
    process.stdout.write(`[down] ${f.name}... `);
    await download(f.url, dest);
    console.log(`OK (${fs.statSync(dest).size} bytes)`);
  }
  console.log('Done. Models at', MODELS_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
