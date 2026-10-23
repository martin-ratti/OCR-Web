import type { OcrBox, OcrMode } from '@ocr-web/shared';
import type { WorkerInMessage, WorkerOutMessage } from './paddleOcr.worker';

const IDLE_TERMINATE_MS = 5 * 60 * 1000;
const MAX_LOCAL_WIDTH = 1760;

export interface LocalOcrProgress {
  status: 'loading' | 'recognizing' | 'idle';
  progress: number;
  device?: 'webgpu' | 'wasm';
}

export interface LocalOcrOutput {
  text: string;
  boxes: OcrBox[];
  rotationDeg: 0 | 90 | 180 | 270;
  device: 'webgpu' | 'wasm';
}

type ProgressListener = (p: LocalOcrProgress) => void;

interface PendingJob {
  resolve: (val: LocalOcrOutput) => void;
  reject: (err: Error) => void;
}

let worker: Worker | null = null;
let nextJobId = 1;
let lastUsedAt = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const pendingJobs = new Map<number, PendingJob>();
const progressListeners = new Set<ProgressListener>();

function emitProgress(p: LocalOcrProgress): void {
  progressListeners.forEach((fn) => {
    try {
      fn(p);
    } catch {
      /* ignore listener errors */
    }
  });
}

export function subscribeLocalOcrProgress(fn: ProgressListener): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

function scheduleIdleTermination(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (Date.now() - lastUsedAt < IDLE_TERMINATE_MS || pendingJobs.size > 0) {
      scheduleIdleTermination();
      return;
    }
    terminateLocalWorker();
  }, IDLE_TERMINATE_MS);
}

export function terminateLocalWorker(): void {
  if (!worker) return;
  try {
    const disposeMsg: WorkerInMessage = { type: 'dispose' };
    worker.postMessage(disposeMsg);
  } catch {
    /* ignore */
  }
  const w = worker;
  worker = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  setTimeout(() => {
    try {
      w.terminate();
    } catch {
      /* ignore */
    }
  }, 150);
}

function getWorker(): Worker {
  if (worker) {
    lastUsedAt = Date.now();
    return worker;
  }

  const w = new Worker(new URL('./paddleOcr.worker.ts', import.meta.url), {
    type: 'module',
  });

  w.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
    const msg = ev.data;
    if (msg.type === 'progress') {
      emitProgress({
        status: msg.status,
        progress: msg.progress,
        device: msg.device,
      });
      return;
    }
    if (msg.type === 'result') {
      const job = pendingJobs.get(msg.id);
      if (job) {
        pendingJobs.delete(msg.id);
        job.resolve({
          text: msg.text,
          boxes: msg.boxes,
          rotationDeg: msg.rotationDeg,
          device: msg.device,
        });
      }
      return;
    }
    if (msg.type === 'error') {
      const job = pendingJobs.get(msg.id);
      if (job) {
        pendingJobs.delete(msg.id);
        job.reject(new Error(msg.message));
      }
    }
  };

  w.onerror = (err) => {
    const error = new Error(err.message || 'Fallo crítico en el Worker de OCR local');
    pendingJobs.forEach((job) => job.reject(error));
    pendingJobs.clear();
    terminateLocalWorker();
  };

  worker = w;
  lastUsedAt = Date.now();
  scheduleIdleTermination();
  return w;
}

async function decodeFileToRgbaBuffer(
  blob: Blob
): Promise<{ width: number; height: number; buffer: ArrayBuffer }> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, MAX_LOCAL_WIDTH / Math.max(1, longest));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new Error('Contexto Canvas 2D no disponible');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const imgData = ctx.getImageData(0, 0, width, height);
  return {
    width,
    height,
    buffer: imgData.data.buffer.slice(0),
  };
}

/**
 * Ejecuta PP-OCRv6 (WebGPU con fallback automático a WASM) dentro de un Web Worker
 * dedicado sin bloquear el hilo principal.
 */
export async function recognizeLocal(
  file: Blob,
  mode: OcrMode = 'highlight'
): Promise<LocalOcrOutput> {
  const { width, height, buffer } = await decodeFileToRgbaBuffer(file);
  const w = getWorker();
  const id = nextJobId++;
  lastUsedAt = Date.now();

  const result = await new Promise<LocalOcrOutput>((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject });
    const payload: WorkerInMessage = {
      type: 'recognize',
      id,
      width,
      height,
      buffer,
      mode,
    };
    w.postMessage(payload, [buffer]);
  });

  lastUsedAt = Date.now();
  scheduleIdleTermination();
  return result;
}
