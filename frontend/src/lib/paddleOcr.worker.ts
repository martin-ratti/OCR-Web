import { NO_HIGHLIGHT_SENTINEL, type OcrBox, type OcrMode } from '@ocr-web/shared';
import type { PaddleOcrService, RecognitionResult } from 'paddleocr';
import {
  annotatePageHighlights,
  compareBoxesReadingOrder,
  estimatePaperWhite,
  getBoxVerticalBoundsAtX,
  getTrueBoxHeight,
  type PixelBox,
  type RgbaImage,
} from './highlightDetector';
import {
  cleanOcrText,
  isAllCapsHeadingLine,
  isPlausibleSpanishLine,
  normalizeSpanishCapsSpacing,
  scoreTextCoherence,
} from './textFormatters';

const CACHE_NAME = 'runonweb-ocr-v2';
const ORT_WASM_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';

const LOCAL_OCR_MODELS = {
  det: 'https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx/resolve/main/inference.onnx',
  rec: 'https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx/resolve/main/inference.onnx',
  yml: 'https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx/resolve/main/inference.yml',
} as const;

export type WorkerInMessage =
  | {
      type: 'recognize';
      id: number;
      width: number;
      height: number;
      buffer: ArrayBuffer;
      mode: OcrMode;
    }
  | { type: 'dispose' };

export type WorkerOutMessage =
  | {
      type: 'progress';
      status: 'loading' | 'recognizing' | 'idle';
      progress: number;
      device?: 'webgpu' | 'wasm';
    }
  | {
      type: 'result';
      id: number;
      text: string;
      boxes: OcrBox[];
      rotationDeg: 0 | 90 | 180 | 270;
      device: 'webgpu' | 'wasm';
    }
  | {
      type: 'error';
      id: number;
      message: string;
    };

type OrtApi = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: unknown;
  InferenceSession: {
    create: (
      model: ArrayBuffer,
      options?: { executionProviders?: string[] }
    ) => Promise<unknown>;
  };
};

let serviceInstance: PaddleOcrService | null = null;
let resolvedDevice: 'webgpu' | 'wasm' = 'wasm';
let initPromise: Promise<PaddleOcrService> | null = null;

function post(msg: WorkerOutMessage): void {
  self.postMessage(msg);
}

async function hasWebGPU(): Promise<boolean> {
  try {
    const nav = (
      self as unknown as {
        navigator?: { gpu?: { requestAdapter?: () => Promise<unknown> } };
      }
    ).navigator;
    if (!nav?.gpu?.requestAdapter) return false;
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function openModelCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function fetchBinaryCached(
  url: string,
  cache: Cache | null,
  onBytes: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  const cached = await cache?.match(url);
  if (cached) {
    const buf = await cached.arrayBuffer();
    onBytes(buf.byteLength, buf.byteLength);
    return buf;
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo descargar el modelo OCR (${res.status})`);
  }

  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    onBytes(buf.byteLength, buf.byteLength);
    void cache?.put(
      url,
      new Response(buf.slice(0), {
        headers: { 'content-length': String(buf.byteLength) },
      })
    );
    return buf;
  }

  const reader = res.body.getReader();
  let chunks = new Uint8Array(total);
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.byteLength > chunks.byteLength) {
      const next = new Uint8Array(Math.max(chunks.byteLength * 2, received + value.byteLength));
      next.set(chunks.subarray(0, received));
      chunks = next;
    }
    chunks.set(value, received);
    received += value.byteLength;
    onBytes(received, total);
  }

  const finalView = received === chunks.byteLength ? chunks : chunks.subarray(0, received);
  const buffer = finalView.slice().buffer;
  void cache?.put(
    url,
    new Response(buffer.slice(0), {
      headers: { 'content-length': String(buffer.byteLength) },
    })
  );
  return buffer;
}

async function fetchTextCached(url: string, cache: Cache | null): Promise<string> {
  const cached = await cache?.match(url);
  if (cached) return cached.text();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar el diccionario OCR (${res.status})`);
  const text = await res.text();
  void cache?.put(url, new Response(text));
  return text;
}

function parseCharacterDict(yml: string): string[] {
  const idx = yml.indexOf('character_dict:');
  if (idx < 0) throw new Error('Diccionario OCR local inválido');
  const chars: string[] = [];
  for (const rawLine of yml.slice(idx).split('\n').slice(1)) {
    const match = rawLine.match(/^\s*-\s+(.*)$/);
    if (!match) {
      if (chars.length > 0 && /^\S/.test(rawLine)) break;
      continue;
    }
    let val = (match[1] ?? '').trim();
    if (val === "''" || val === '""') {
      val = '';
    } else if (
      (val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))
    ) {
      const inner = val.slice(1, -1);
      val = val.startsWith("'") ? inner.replace(/''/g, "'") : inner.replace(/\\"/g, '"');
    }
    chars.push(val);
  }
  if (chars[chars.length - 1] !== ' ') {
    chars.push(' ');
  }
  return chars;
}

async function ensureService(): Promise<PaddleOcrService> {
  if (serviceInstance) return serviceInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    post({ type: 'progress', status: 'loading', progress: 0.02 });
    const cache = await openModelCache();

    const loadedMap = { det: 0, rec: 0 };
    const totalMap = { det: 14_000_000, rec: 7_800_000 };
    let lastEmit = 0;

    const emitDownload = (force = false) => {
      const now = performance.now();
      if (!force && now - lastEmit < 45) return;
      lastEmit = now;
      const ratio = Math.min(
        0.95,
        (loadedMap.det + loadedMap.rec) / Math.max(1, totalMap.det + totalMap.rec)
      );
      post({ type: 'progress', status: 'loading', progress: ratio });
    };

    const [detBuf, recBuf, ymlText, ortMod, { PaddleOcrService: Ctor }, canWebGPU] =
      await Promise.all([
        fetchBinaryCached(LOCAL_OCR_MODELS.det, cache, (l, t) => {
          loadedMap.det = l;
          if (t > 0) totalMap.det = t;
          emitDownload(l >= t);
        }),
        fetchBinaryCached(LOCAL_OCR_MODELS.rec, cache, (l, t) => {
          loadedMap.rec = l;
          if (t > 0) totalMap.rec = t;
          emitDownload(l >= t);
        }),
        fetchTextCached(LOCAL_OCR_MODELS.yml, cache),
        import('onnxruntime-web') as unknown as Promise<OrtApi>,
        import('paddleocr'),
        hasWebGPU(),
      ]);

    ortMod.env.wasm.wasmPaths = ORT_WASM_CDN;
    ortMod.env.wasm.numThreads = 1;

    const charactersDictionary = parseCharacterDict(ymlText);

    const buildWithDevice = async (device: 'webgpu' | 'wasm') => {
      const providers = device === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];
      const wrappedOrt = {
        Tensor: ortMod.Tensor,
        InferenceSession: {
          create: (modelBuffer: ArrayBuffer) =>
            ortMod.InferenceSession.create(modelBuffer, { executionProviders: providers }),
        },
      };
      const copyNeeded = device === 'webgpu';
      return Ctor.createInstance({
        ort: wrappedOrt as never,
        modelPreset: 'PP-OCRv6_small',
        detection: {
          modelBuffer: copyNeeded ? detBuf.slice(0) : detBuf,
          limitType: 'max',
          maxSideLength: 1600,
          boxScoreThreshold: 0.48,
          unclipRatio: 1.65,
        },
        recognition: {
          modelBuffer: copyNeeded ? recBuf.slice(0) : recBuf,
          charactersDictionary,
          channelOrder: 'bgr',
          outputSelectionStrategy: 'ctc-logits',
        },
      });
    };

    if (canWebGPU) {
      try {
        serviceInstance = await buildWithDevice('webgpu');
        resolvedDevice = 'webgpu';
      } catch {
        serviceInstance = await buildWithDevice('wasm');
        resolvedDevice = 'wasm';
      }
    } else {
      serviceInstance = await buildWithDevice('wasm');
      resolvedDevice = 'wasm';
    }

    post({ type: 'progress', status: 'idle', progress: 1, device: resolvedDevice });
    return serviceInstance;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

function rotateRgba180(src: RgbaImage): RgbaImage {
  const { width, height, data } = src;
  const out = new Uint8Array(data.length);
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const j = total - 1 - i;
    const si = i * 4;
    const di = j * 4;
    out[di] = data[si];
    out[di + 1] = data[si + 1];
    out[di + 2] = data[si + 2];
    out[di + 3] = data[si + 3];
  }
  return { width, height, data: out };
}

function rotateRgba90CW(src: RgbaImage): RgbaImage {
  const { width: w, height: h, data } = src;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = (x * h + (h - 1 - y)) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { width: h, height: w, data: out };
}

function rotateRgba270CW(src: RgbaImage): RgbaImage {
  const { width: w, height: h, data } = src;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = ((w - 1 - x) * h + y) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { width: h, height: w, data: out };
}

function applyRotation(src: RgbaImage, deg: 0 | 90 | 180 | 270): RgbaImage {
  if (deg === 90) return rotateRgba90CW(src);
  if (deg === 270) return rotateRgba270CW(src);
  if (deg === 180) return rotateRgba180(src);
  return src;
}

function mapBoxToBaseNormalized(
  box: PixelBox,
  uprightW: number,
  uprightH: number,
  deg: 0 | 90 | 180 | 270
): Pick<OcrBox, 'xmin' | 'ymin' | 'xmax' | 'ymax'> {
  const ux0 = Math.min(1, Math.max(0, box.x / uprightW));
  const uy0 = Math.min(1, Math.max(0, box.y / uprightH));
  const ux1 = Math.min(1, Math.max(0, (box.x + box.width) / uprightW));
  const uy1 = Math.min(1, Math.max(0, (box.y + box.height) / uprightH));

  if (deg === 270) {
    return { xmin: 1 - uy1, ymin: ux0, xmax: 1 - uy0, ymax: ux1 };
  }
  if (deg === 90) {
    return { xmin: uy0, ymin: 1 - ux1, xmax: uy1, ymax: 1 - ux0 };
  }
  if (deg === 180) {
    return { xmin: 1 - ux1, ymin: 1 - uy1, xmax: 1 - ux0, ymax: 1 - uy0 };
  }
  return { xmin: ux0, ymin: uy0, xmax: ux1, ymax: uy1 };
}

interface PassCandidate {
  deg: 0 | 90 | 180 | 270;
  img: RgbaImage;
  raw: RecognitionResult[];
  combinedScore: number;
  verticalRatio: number;
}

function evaluateCandidate(
  service: PaddleOcrService,
  deg: 0 | 90 | 180 | 270,
  img: RgbaImage,
  raw: RecognitionResult[]
): PassCandidate {
  const validItems = raw.filter((r) => r.confidence >= 0.52 && r.text.trim().length > 0);
  if (validItems.length === 0) {
    return { deg, img, raw, combinedScore: 0, verticalRatio: 0 };
  }

  const sizable = validItems.filter((r) => Math.max(r.box.width, r.box.height) >= 55);
  const verticalCount = sizable.filter((r) => r.box.height > r.box.width * 1.6).length;
  const verticalRatio = sizable.length > 0 ? verticalCount / sizable.length : 0;

  const processed = service.processRecognition(validItems, {
    recognitionScoreThreshold: 0.52,
    lineMergeThresholdRatio: 0.55,
  });
  const meanConf = processed.confidence;
  const coherence = scoreTextCoherence(processed.text);
  const volumeBonus = Math.min(1, validItems.length / 6) * 0.1;

  const orientationFactor = 1 - Math.min(0.85, verticalRatio * 0.92);
  const combinedScore = (meanConf * 0.55 + coherence * 0.35 + volumeBonus) * orientationFactor;

  return { deg, img, raw: validItems, combinedScore, verticalRatio };
}

const PREFIXED_HEADING_RE =
  /^(?:(?:T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N)\b|\d+[.)]\s+[A-ZÁÉÍÓÚÑ]|[A-Z][.)]\s+[A-ZÁÉÍÓÚÑ])/i;

function formatSelectedEntries(entries: Array<{ box: PixelBox; text: string }>): string {
  if (entries.length === 0) return '';

  const sorted = entries.slice().sort((a, b) => compareBoxesReadingOrder(a.box, b.box));

  const lines: Array<{
    box: PixelBox;
    x: number;
    right: number;
    trueH: number;
    parts: string[];
  }> = [];

  for (const entry of sorted) {
    const txt = normalizeSpanishCapsSpacing(entry.text.trim());
    if (!txt) continue;
    const prev = lines[lines.length - 1];
    const trueH = getTrueBoxHeight(entry.box);

    if (prev) {
      const overlapX = Math.min(prev.right, entry.box.x + entry.box.width) - Math.max(prev.x, entry.box.x);
      const minW = Math.max(1, Math.min(prev.right - prev.x, entry.box.width));
      const midX = (Math.min(prev.right, entry.box.x + entry.box.width) + Math.max(prev.x, entry.box.x)) * 0.5;
      const bPrev = getBoxVerticalBoundsAtX(prev.box, midX);
      const bCurr = getBoxVerticalBoundsAtX(entry.box, midX);
      const cPrev = (bPrev.top + bPrev.bottom) * 0.5;
      const cCurr = (bCurr.top + bCurr.bottom) * 0.5;

      // Solo fusionar fragmentos horizontales disjuntos que compartan la misma línea base
      if (
        overlapX <= minW * 0.25 &&
        Math.abs(cPrev - cCurr) <= Math.max(prev.trueH, trueH) * 0.55
      ) {
        prev.parts.push(txt);
        prev.right = Math.max(prev.right, entry.box.x + entry.box.width);
        continue;
      }
    }

    lines.push({
      box: entry.box,
      x: entry.box.x,
      right: entry.box.x + entry.box.width,
      trueH,
      parts: [txt],
    });
  }

  const validLines = lines
    .map((l) => ({ ...l, text: l.parts.join(' ').trim() }))
    .filter((l) => isPlausibleSpanishLine(l.text));

  if (validLines.length === 0) return '';

  const xSorted = validLines.map((l) => l.x).sort((a, b) => a - b);
  const baseBodyLeft = xSorted[Math.floor(xSorted.length * 0.2)] ?? 0;

  const outChunks: string[] = [];
  for (let i = 0; i < validLines.length; i++) {
    const curr = validLines[i];
    if (i === 0) {
      outChunks.push(curr.text);
      continue;
    }

    const prev = validLines[i - 1];
    const avgTrueH = (prev.trueH + curr.trueH) * 0.5;
    const sharedX =
      (Math.max(prev.x, curr.x) + Math.min(prev.right, curr.right)) * 0.5;
    const bPrev = getBoxVerticalBoundsAtX(prev.box, sharedX);
    const bCurr = getBoxVerticalBoundsAtX(curr.box, sharedX);
    const verticalGap = bCurr.top - bPrev.bottom;

    const prevIsHeading = isAllCapsHeadingLine(prev.text);
    const currIsHeading = isAllCapsHeadingLine(curr.text);

    // Continuación de un mismo título largo partido en dos renglones
    if (
      prevIsHeading &&
      currIsHeading &&
      verticalGap <= avgTrueH * 0.65 &&
      !PREFIXED_HEADING_RE.test(curr.text) &&
      !prev.text.endsWith(':') &&
      !prev.text.endsWith('.')
    ) {
      outChunks.push(' ' + curr.text);
      continue;
    }

    if (verticalGap > avgTrueH * 0.65 || currIsHeading || prevIsHeading) {
      outChunks.push('\n\n' + curr.text);
      continue;
    }

    const hasNewParagraphIndent =
      curr.x - baseBodyLeft >= avgTrueH * 0.85 &&
      curr.x - prev.x >= avgTrueH * 0.65 &&
      /[.:;?!»"')\]]$/.test(prev.text);

    if (hasNewParagraphIndent) {
      outChunks.push('\n\n' + curr.text);
      continue;
    }

    outChunks.push('\n' + curr.text);
  }

  return cleanOcrText(outChunks.join(''));
}

let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === 'dispose') {
    queue = queue.then(async () => {
      if (serviceInstance) {
        try {
          await serviceInstance.destroy();
        } catch {
          /* ignore */
        }
        serviceInstance = null;
      }
    });
    return;
  }

  if (msg.type === 'recognize') {
    queue = queue.then(async () => {
      try {
        const service = await ensureService();
        post({ type: 'progress', status: 'recognizing', progress: 0.1, device: resolvedDevice });

        const baseImg: RgbaImage = {
          width: msg.width,
          height: msg.height,
          data: new Uint8Array(msg.buffer),
        };

        const raw0 = await service.recognize(
          {
            width: baseImg.width,
            height: baseImg.height,
            data: baseImg.data as Uint8Array,
          },
          {
            onProgress: (ev) => {
              if (ev.type === 'rec' && ev.progress.total > 0) {
                const ratio = 0.15 + (ev.progress.current / ev.progress.total) * 0.72;
                post({
                  type: 'progress',
                  status: 'recognizing',
                  progress: Math.min(0.92, ratio),
                  device: resolvedDevice,
                });
              }
            },
          }
        );

        let best = evaluateCandidate(service, 0, baseImg, raw0);

        if (best.verticalRatio >= 0.3 || best.combinedScore < 0.72) {
          const candidateDegrees: Array<90 | 180 | 270> =
            best.verticalRatio >= 0.3 ? [270, 90] : [270, 90, 180];

          for (const deg of candidateDegrees) {
            const rotImg = applyRotation(baseImg, deg);
            const rotRaw = await service.recognize({
              width: rotImg.width,
              height: rotImg.height,
              data: rotImg.data as Uint8Array,
            });
            const cand = evaluateCandidate(service, deg, rotImg, rotRaw);
            if (cand.combinedScore > best.combinedScore + 0.05) {
              best = cand;
              if (best.combinedScore >= 0.78 && best.verticalRatio < 0.15) break;
            }
          }
        }

        const paper = estimatePaperWhite(best.img);
        const annotated = annotatePageHighlights(best.img, best.raw, paper);

        const boxes: OcrBox[] = annotated
          .filter((a) => !a.isNoise && isPlausibleSpanishLine(a.item.text))
          .map(({ item, highlighted, highlightedText }) => ({
            text: normalizeSpanishCapsSpacing(
              (highlighted && highlightedText ? highlightedText : item.text).trim()
            ),
            score: Math.min(1, Math.max(0, item.confidence)),
            highlighted,
            ...mapBoxToBaseNormalized(
              item.box,
              best.img.width,
              best.img.height,
              best.deg
            ),
          }));

        let finalText = '';
        if (msg.mode === 'highlight') {
          const hiEntries = annotated
            .filter((a) => !a.isNoise && a.highlighted && a.highlightedText.length > 0)
            .map((a) => ({ box: a.item.box, text: a.highlightedText }));
          if (hiEntries.length === 0) {
            finalText = NO_HIGHLIGHT_SENTINEL;
          } else {
            finalText = formatSelectedEntries(hiEntries) || NO_HIGHLIGHT_SENTINEL;
          }
        } else {
          const fullEntries = annotated
            .filter((a) => !a.isNoise)
            .map((a) => ({ box: a.item.box, text: a.item.text }));
          finalText =
            formatSelectedEntries(fullEntries) || 'Sin texto legible en la imagen.';
        }

        post({ type: 'progress', status: 'idle', progress: 1, device: resolvedDevice });
        post({
          type: 'result',
          id: msg.id,
          text: finalText,
          boxes,
          rotationDeg: best.deg,
          device: resolvedDevice,
        });
      } catch (err) {
        post({ type: 'progress', status: 'idle', progress: 1, device: resolvedDevice });
        post({
          type: 'error',
          id: msg.id,
          message: err instanceof Error ? err.message : 'Error en motor local OCR',
        });
      }
    });
  }
};
