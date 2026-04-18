import { create } from 'zustand';
import { ExtractResponseSchema } from '../shared/schema';
import { getApiBase, isRateLimitMessage } from '../shared/api';
import { downscaleImage } from '../lib/imageDownscale';

export type OcrStatus = 'idle' | 'processing' | 'success' | 'error';

export interface OcrFile {
  id: string;
  file: File;
  previewUrl: string;
  status: OcrStatus;
  resultText?: string;
  errorMessage?: string;
  infoMessage?: string;
}

interface OcrState {
  files: OcrFile[];
  activeFileId: string | null;
  globalStatus: 'idle' | 'working' | 'done';
  globalProgress: number;

  addFiles: (files: File[]) => void;
  setActiveFile: (id: string) => void;
  removeFile: (id: string) => void;
  clearAll: () => void;

  processAll: () => Promise<void>;
  processOne: (id: string) => Promise<void>;
  cancel: () => void;
  updateFileResult: (id: string, text: string) => void;
}

const MAX_FILES = 200;
const INTER_FILE_DELAY_MS = 5000;
const MAX_ATTEMPTS = 5;

let abortController: AbortController | null = null;
let cancelled = false;

async function extractOneWithRetries(
  store: OcrState,
  setState: (fn: (s: OcrState) => Partial<OcrState>) => void,
  fileId: string,
  signal: AbortSignal
): Promise<void> {
  const target = store.files.find((f) => f.id === fileId);
  if (!target) return;

  setState((s) => ({
    files: s.files.map((f) =>
      f.id === fileId
        ? { ...f, status: 'processing', errorMessage: undefined, infoMessage: undefined }
        : f
    ),
  }));

  const compressed = await downscaleImage(target.file);

  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    if (signal.aborted) return;

    try {
      const formData = new FormData();
      formData.append('image', compressed, compressed.name);

      const res = await fetch(`${getApiBase()}/api/ocr/extract`, {
        method: 'POST',
        body: formData,
        signal,
      });

      const rawJson = await res.json().catch(() => null);
      const parsed = rawJson ? ExtractResponseSchema.safeParse(rawJson) : null;
      const body = parsed?.success ? parsed.data : null;

      if (!res.ok || body?.status === 'error') {
        const errMsg = body?.warnings?.[0] ?? res.statusText ?? 'Error desconocido';
        const rateLimit = res.status === 429 || res.status === 503 || isRateLimitMessage(errMsg);
        if (rateLimit) throw new Error('RateLimit');
        throw new Error(errMsg);
      }

      if (!body) throw new Error('Respuesta inválida del servidor');

      setState((s) => ({
        files: s.files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: 'success',
                resultText: body.text,
                errorMessage: undefined,
                infoMessage: undefined,
              }
            : f
        ),
      }));
      return;
    } catch (err: unknown) {
      if (signal.aborted) return;

      const e = err as Error;
      if (e.name === 'AbortError') return;

      attempt++;
      const isRate = e.message === 'RateLimit';
      const canRetry = attempt < MAX_ATTEMPTS;

      if (!canRetry) {
        setState((s) => ({
          files: s.files.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  status: 'error',
                  errorMessage: isRate
                    ? 'Límite de la IA alcanzado. La cuota gratuita se agotó. Probá más tarde.'
                    : e.message || 'Error desconocido',
                  infoMessage: undefined,
                }
              : f
          ),
        }));
        return;
      }

      const waitSec = isRate ? attempt * 15 : attempt * 3;
      setState((s) => ({
        files: s.files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                infoMessage: isRate
                  ? `La IA está a mil. Esperando ${waitSec}s (intento ${attempt}/${MAX_ATTEMPTS - 1})...`
                  : `Reintentando en ${waitSec}s (intento ${attempt}/${MAX_ATTEMPTS - 1})...`,
              }
            : f
        ),
      }));

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, waitSec * 1000);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new DOMException('aborted', 'AbortError'));
          },
          { once: true }
        );
      }).catch(() => {});
    }
  }
}

export const useOcrStore = create<OcrState>((set, get) => ({
  files: [],
  activeFileId: null,
  globalStatus: 'idle',
  globalProgress: 0,

  addFiles: (newFiles) => {
    set((state) => {
      const remainingSlots = MAX_FILES - state.files.length;
      const accepted = newFiles.slice(0, Math.max(0, remainingSlots));

      const ocrFiles: OcrFile[] = accepted.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: 'idle',
      }));

      const updated = [...state.files, ...ocrFiles];
      return {
        files: updated,
        activeFileId: state.activeFileId || ocrFiles[0]?.id || null,
        globalStatus: 'idle',
        globalProgress: 0,
      };
    });
  },

  setActiveFile: (id) => set({ activeFileId: id }),

  removeFile: (id) =>
    set((state) => {
      const toRemove = state.files.find((f) => f.id === id);
      if (toRemove) URL.revokeObjectURL(toRemove.previewUrl);

      const remaining = state.files.filter((f) => f.id !== id);
      return {
        files: remaining,
        activeFileId:
          state.activeFileId === id ? remaining[0]?.id ?? null : state.activeFileId,
      };
    }),

  clearAll: () => {
    cancelled = true;
    abortController?.abort();
    abortController = null;
    set((state) => {
      state.files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      return {
        files: [],
        activeFileId: null,
        globalStatus: 'idle',
        globalProgress: 0,
      };
    });
  },

  updateFileResult: (id, text) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, resultText: text } : f)),
    })),

  cancel: () => {
    cancelled = true;
    abortController?.abort();
    abortController = null;
    set({ globalStatus: 'done' });
  },

  processOne: async (id) => {
    abortController = new AbortController();
    cancelled = false;
    set({ globalStatus: 'working' });
    const state = get();
    await extractOneWithRetries(state, set as never, id, abortController.signal);
    if (!cancelled) set({ globalStatus: 'done' });
  },

  processAll: async () => {
    const state = get();
    const toProcess = state.files.filter((f) => f.status === 'idle' || f.status === 'error');
    if (toProcess.length === 0) return;

    abortController = new AbortController();
    cancelled = false;
    const { signal } = abortController;

    set({ globalStatus: 'working', globalProgress: 0 });

    for (let i = 0; i < toProcess.length; i++) {
      if (signal.aborted || cancelled) break;

      await extractOneWithRetries(get(), set as never, toProcess[i].id, signal);

      const processedCount = i + 1;
      set({ globalProgress: Math.round((processedCount / toProcess.length) * 100) });

      if (i < toProcess.length - 1 && !signal.aborted) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, INTER_FILE_DELAY_MS);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            resolve();
          }, { once: true });
        });
      }
    }

    set({ globalStatus: 'done' });
  },
}));
