import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ExtractResponseSchema } from '@ocr-web/shared';
import { isRateLimitMessage, isUpstreamBusyMessage, processOcr, type OcrEngine } from '../shared/api';
import { downscaleImage } from '../lib/imageDownscale';
import { recognizeLocal } from '../lib/tesseractAdapter';

export type OcrStatus = 'idle' | 'processing' | 'success' | 'error';

export interface OcrFile {
  id: string;
  file: File;
  previewUrl: string;
  status: OcrStatus;
  resultText?: string;
  errorMessage?: string;
  infoMessage?: string;
  compressed?: File;
}

interface UndoSnapshot {
  files: OcrFile[];
  activeFileId: string | null;
  takenAt: number;
}

interface OcrState {
  files: OcrFile[];
  activeFileId: string | null;
  globalStatus: 'idle' | 'working' | 'done';
  globalProgress: number;
  selectedEngine: OcrEngine;
  fontSize: number;
  textCache: Record<string, string>;
  lastClearedSnapshot: UndoSnapshot | null;

  addFiles: (files: File[]) => void;
  setActiveFile: (id: string) => void;
  removeFile: (id: string) => void;
  clearAll: () => void;
  restoreCleared: () => boolean;
  setSelectedEngine: (engine: OcrEngine) => void;
  setFontSize: (size: number) => void;

  processAll: () => Promise<void>;
  processOne: (id: string) => Promise<void>;
  retryAllErrors: () => Promise<void>;
  processSelected: (ids: string[]) => Promise<void>;
  removeFiles: (ids: string[]) => void;
  reorderFile: (fromId: string, toId: string) => void;
  cancel: () => void;
  updateFileResult: (id: string, text: string) => void;
  revokeAllPreviews: () => void;
}

const MAX_FILES = 200;
const INTER_FILE_DELAY_MS = 5000;
const MAX_ATTEMPTS = 5;
const UNDO_TTL_MS = 12_000;

let abortController: AbortController | null = null;
let cancelled = false;

function cacheKey(f: File): string {
  return `${f.name}::${f.size}`;
}

async function ensureCompressed(state: OcrState, fileId: string): Promise<File> {
  const target = state.files.find((f) => f.id === fileId);
  if (!target) throw new Error('File not found');
  if (target.compressed) return target.compressed;
  const c = await downscaleImage(target.file);
  return c;
}

async function extractOneWithRetries(
  store: OcrState,
  setState: (fn: (s: OcrState) => Partial<OcrState>) => void,
  fileId: string,
  signal: AbortSignal,
): Promise<void> {
  const target = store.files.find((f) => f.id === fileId);
  if (!target) return;

  setState((s) => ({
    files: s.files.map((f) =>
      f.id === fileId
        ? { ...f, status: 'processing', errorMessage: undefined, infoMessage: undefined }
        : f,
    ),
  }));

  const compressed = target.compressed ?? (await downscaleImage(target.file));
  if (!target.compressed) {
    setState((s) => ({
      files: s.files.map((f) => (f.id === fileId ? { ...f, compressed } : f)),
    }));
  }

  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    if (signal.aborted) return;

    try {
      let text: string;
      if (store.selectedEngine === 'paddle') {
        // Local engine runs entirely in the browser via tesseract.js — no
        // HTTP, no Render, no Gemini quota burn. Aborting mid-recognition is
        // not natively supported by tesseract.js, but each image is short
        // enough (<10 s on a typical laptop) that we just let the in-flight
        // call settle and check the signal afterwards.
        text = await recognizeLocal(compressed);
        if (signal.aborted) return;
      } else {
        const res = await processOcr(compressed, compressed.name, store.selectedEngine, signal);
        const rawJson = await res.json().catch(() => null);
        const parsed = rawJson ? ExtractResponseSchema.safeParse(rawJson) : null;
        const body = parsed?.success ? parsed.data : null;

        if (!res.ok || body?.status === 'error') {
          const errMsg = body?.warnings?.[0] ?? res.statusText ?? 'Error desconocido';
          // 429 = quota agotada (backoff largo, mensaje "agotada"). 503/502/504 =
          // saturación temporal del modelo (backoff corto, mensaje "saturado").
          // Antes el 503 caía a "Unhandled" en el server (500) y el cliente no
          // reintentaba; ahora el server devuelve 503 y entra acá.
          if (res.status === 429 || isRateLimitMessage(errMsg)) {
            throw new Error('RateLimit');
          }
          if (res.status === 503 || res.status === 502 || res.status === 504 || isUpstreamBusyMessage(errMsg)) {
            throw new Error('UpstreamBusy');
          }
          throw new Error(errMsg);
        }
        if (!body) throw new Error('Respuesta inválida del servidor');
        text = body.text;
      }
      setState((s) => ({
        files: s.files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: 'success',
                resultText: text,
                errorMessage: undefined,
                infoMessage: undefined,
              }
            : f,
        ),
        textCache: { ...s.textCache, [cacheKey(target.file)]: text },
      }));
      return;
    } catch (err: unknown) {
      if (signal.aborted) return;

      const e = err as Error;
      if (e.name === 'AbortError') return;

      attempt++;
      const isRate = e.message === 'RateLimit';
      const isBusy = e.message === 'UpstreamBusy';
      // Local engine errors are deterministic (model load failure, OOM, image
      // decode error). Retrying with backoff would just stall the queue on
      // the same failure five times. Fail fast.
      const canRetry = store.selectedEngine !== 'paddle' && attempt < MAX_ATTEMPTS;

      if (!canRetry) {
        setState((s) => ({
          files: s.files.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  status: 'error',
                  errorMessage: isRate
                    ? 'Límite de la IA alcanzado. La cuota gratuita se agotó. Probá más tarde.'
                    : isBusy
                      ? 'El modelo de IA está saturado. Probá de nuevo en unos minutos o usá el motor local.'
                      : e.message || 'Error desconocido',
                  infoMessage: undefined,
                }
              : f,
          ),
        }));
        return;
      }

      // Backoff diferenciado: cuota (15·n s) > saturación upstream (8·n s) > genérico (3·n s).
      const waitSec = isRate ? attempt * 15 : isBusy ? attempt * 8 : attempt * 3;
      setState((s) => ({
        files: s.files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                infoMessage: isRate
                  ? `La IA está a mil. Esperando ${waitSec}s (intento ${attempt}/${MAX_ATTEMPTS - 1})...`
                  : isBusy
                    ? `Modelo saturado, reintentando en ${waitSec}s (intento ${attempt}/${MAX_ATTEMPTS - 1})...`
                    : `Reintentando en ${waitSec}s (intento ${attempt}/${MAX_ATTEMPTS - 1})...`,
              }
            : f,
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
          { once: true },
        );
      }).catch(() => {});
    }
  }
}

export const useOcrStore = create<OcrState>()(
  persist(
    (set, get) => ({
      files: [],
      activeFileId: null,
      globalStatus: 'idle',
      globalProgress: 0,
      selectedEngine: 'gemini',
      fontSize: 16,
      textCache: {},
      lastClearedSnapshot: null,

      setSelectedEngine: (engine) => set({ selectedEngine: engine }),
      setFontSize: (size) => set({ fontSize: Math.min(28, Math.max(12, Math.round(size))) }),

      addFiles: (newFiles) => {
        set((state) => {
          const remainingSlots = MAX_FILES - state.files.length;
          const accepted = newFiles.slice(0, Math.max(0, remainingSlots));

          const ocrFiles: OcrFile[] = accepted.map((f) => {
            const cached = state.textCache[cacheKey(f)];
            return {
              id: crypto.randomUUID(),
              file: f,
              previewUrl: URL.createObjectURL(f),
              status: cached ? 'success' : 'idle',
              resultText: cached,
            };
          });

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
          if (state.files.length === 0) return {};
          const snapshot: UndoSnapshot = {
            files: state.files,
            activeFileId: state.activeFileId,
            takenAt: Date.now(),
          };
          return {
            files: [],
            activeFileId: null,
            globalStatus: 'idle',
            globalProgress: 0,
            lastClearedSnapshot: snapshot,
          };
        });
        window.setTimeout(() => {
          const snap = get().lastClearedSnapshot;
          if (snap && Date.now() - snap.takenAt >= UNDO_TTL_MS) {
            snap.files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
            set({ lastClearedSnapshot: null });
          }
        }, UNDO_TTL_MS + 200);
      },

      restoreCleared: () => {
        const snap = get().lastClearedSnapshot;
        if (!snap) return false;
        if (Date.now() - snap.takenAt > UNDO_TTL_MS) {
          set({ lastClearedSnapshot: null });
          return false;
        }
        set({
          files: snap.files,
          activeFileId: snap.activeFileId,
          lastClearedSnapshot: null,
          globalStatus: 'idle',
          globalProgress: 0,
        });
        return true;
      },

      revokeAllPreviews: () => {
        const { files, lastClearedSnapshot } = get();
        files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        lastClearedSnapshot?.files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      },

      updateFileResult: (id, text) =>
        set((state) => {
          const target = state.files.find((f) => f.id === id);
          const newCache = target
            ? { ...state.textCache, [cacheKey(target.file)]: text }
            : state.textCache;
          return {
            files: state.files.map((f) => (f.id === id ? { ...f, resultText: text } : f)),
            textCache: newCache,
          };
        }),

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

          const nextId = toProcess[i + 1]?.id;
          const prewarm = nextId
            ? ensureCompressed(get(), nextId)
                .then((c) =>
                  set((s) => ({
                    files: s.files.map((f) => (f.id === nextId ? { ...f, compressed: c } : f)),
                  })),
                )
                .catch(() => {})
            : Promise.resolve();

          await extractOneWithRetries(get(), set as never, toProcess[i].id, signal);

          const processedCount = i + 1;
          set({ globalProgress: Math.round((processedCount / toProcess.length) * 100) });

          if (i < toProcess.length - 1 && !signal.aborted) {
            // 5 s inter-file pause exists to keep us under Gemini's 15 RPM
            // free-tier ceiling. The local engine has no per-minute quota,
            // so we only pay the cost of `prewarm` between images.
            const interFileDelay =
              get().selectedEngine === 'paddle' ? 0 : INTER_FILE_DELAY_MS;
            await Promise.all([
              prewarm,
              interFileDelay === 0
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                    const t = setTimeout(resolve, interFileDelay);
                    signal.addEventListener(
                      'abort',
                      () => {
                        clearTimeout(t);
                        resolve();
                      },
                      { once: true },
                    );
                  }),
            ]);
          }
        }

        set({ globalStatus: 'done' });
      },

      retryAllErrors: async () => {
        const errored = get().files.filter((f) => f.status === 'error');
        if (errored.length === 0) return;
        await get().processAll();
      },

      reorderFile: (fromId, toId) =>
        set((state) => {
          if (fromId === toId) return {};
          const fromIdx = state.files.findIndex((f) => f.id === fromId);
          const toIdx = state.files.findIndex((f) => f.id === toId);
          if (fromIdx < 0 || toIdx < 0) return {};
          const next = state.files.slice();
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          return { files: next };
        }),

      removeFiles: (ids) =>
        set((state) => {
          const idSet = new Set(ids);
          state.files.forEach((f) => {
            if (idSet.has(f.id)) URL.revokeObjectURL(f.previewUrl);
          });
          const remaining = state.files.filter((f) => !idSet.has(f.id));
          return {
            files: remaining,
            activeFileId:
              state.activeFileId && idSet.has(state.activeFileId)
                ? remaining[0]?.id ?? null
                : state.activeFileId,
          };
        }),

      processSelected: async (ids) => {
        const idSet = new Set(ids);
        const toProcess = get().files.filter((f) => idSet.has(f.id) && f.status !== 'processing');
        if (toProcess.length === 0) return;

        set((s) => ({
          files: s.files.map((f) =>
            idSet.has(f.id) && f.status !== 'processing'
              ? {
                  ...f,
                  status: 'idle',
                  errorMessage: undefined,
                  infoMessage: undefined,
                }
              : f,
          ),
        }));

        abortController = new AbortController();
        cancelled = false;
        const { signal } = abortController;

        set({ globalStatus: 'working', globalProgress: 0 });

        for (let i = 0; i < toProcess.length; i++) {
          if (signal.aborted || cancelled) break;

          const nextId = toProcess[i + 1]?.id;
          const prewarm = nextId
            ? ensureCompressed(get(), nextId)
                .then((c) =>
                  set((s) => ({
                    files: s.files.map((f) => (f.id === nextId ? { ...f, compressed: c } : f)),
                  })),
                )
                .catch(() => {})
            : Promise.resolve();

          await extractOneWithRetries(get(), set as never, toProcess[i].id, signal);

          const processedCount = i + 1;
          set({ globalProgress: Math.round((processedCount / toProcess.length) * 100) });

          if (i < toProcess.length - 1 && !signal.aborted) {
            // 5 s inter-file pause exists to keep us under Gemini's 15 RPM
            // free-tier ceiling. The local engine has no per-minute quota,
            // so we only pay the cost of `prewarm` between images.
            const interFileDelay =
              get().selectedEngine === 'paddle' ? 0 : INTER_FILE_DELAY_MS;
            await Promise.all([
              prewarm,
              interFileDelay === 0
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                    const t = setTimeout(resolve, interFileDelay);
                    signal.addEventListener(
                      'abort',
                      () => {
                        clearTimeout(t);
                        resolve();
                      },
                      { once: true },
                    );
                  }),
            ]);
          }
        }

        set({ globalStatus: 'done' });
      },
    }),
    {
      name: 'ocr-web-state',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedEngine: state.selectedEngine,
        fontSize: state.fontSize,
        textCache: state.textCache,
      }),
    },
  ),
);

export const ocrSelectors = {
  files: (s: OcrState) => s.files,
  activeFile: (s: OcrState) => s.files.find((f) => f.id === s.activeFileId),
  activeFileId: (s: OcrState) => s.activeFileId,
  globalStatus: (s: OcrState) => s.globalStatus,
  globalProgress: (s: OcrState) => s.globalProgress,
  selectedEngine: (s: OcrState) => s.selectedEngine,
  fontSize: (s: OcrState) => s.fontSize,
  hasUndo: (s: OcrState) => !!s.lastClearedSnapshot,
};
