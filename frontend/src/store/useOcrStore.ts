import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import {
  ExtractResponseSchema,
  NO_HIGHLIGHT_SENTINEL,
  type OcrBox,
  type OcrEngine,
  type OcrMode,
} from '@ocr-web/shared';
import { isRateLimitMessage, isUpstreamBusyMessage, processOcr } from '../shared/api';
import { downscaleImage } from '../lib/imageDownscale';
import { recognizeLocal } from '../lib/paddleAdapter';
import { checkBlobHasHighlight } from '../lib/highlightDetector';
import { cleanOcrText } from '../lib/textFormatters';

export type OcrStatus = 'idle' | 'processing' | 'success' | 'error';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 250;

export interface AddFilesResult {
  acceptedCount: number;
  duplicates: string[];
  oversized: string[];
  capExceeded: number;
}

export interface OcrFile {
  id: string;
  file: File;
  previewUrl: string;
  status: OcrStatus;
  resultText?: string;
  errorMessage?: string;
  infoMessage?: string;
  compressed?: File;
  boxes?: OcrBox[];
  rotationDeg?: 0 | 90 | 180 | 270;
  quotaSaved?: boolean;
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
  extractionMode: OcrMode;
  fontSize: number;
  textCache: Record<string, string>;
  quotaSavedCount: number;
  lastClearedSnapshot: UndoSnapshot | null;

  addFiles: (files: File[]) => AddFilesResult;
  setActiveFile: (id: string) => void;
  removeFile: (id: string) => void;
  clearAll: () => void;
  restoreCleared: () => boolean;
  setSelectedEngine: (engine: OcrEngine) => void;
  setExtractionMode: (mode: OcrMode) => void;
  setFontSize: (size: number) => void;
  rotateFilePreview: (id: string) => void;

  processAll: () => Promise<void>;
  processOne: (id: string) => Promise<void>;
  processOneFullPage: (id: string) => Promise<void>;
  forceRetry: (id: string) => Promise<void>;
  retryAllErrors: () => Promise<void>;
  processSelected: (ids: string[]) => Promise<void>;
  removeFiles: (ids: string[]) => void;
  reorderFile: (fromId: string, toId: string) => void;
  cancel: () => void;
  updateFileResult: (id: string, text: string) => void;
  revokeAllPreviews: () => void;
}

const MAX_FILES = 200;
const INTER_FILE_DELAY_GEMINI_MS = 4200;
const INTER_FILE_DELAY_GROQ_MS = 2000;
const MAX_ATTEMPTS = 5;
const MAX_BUSY_ATTEMPTS = 3;
const UNDO_TTL_MS = 12_000;

let abortController: AbortController | null = null;
let cancelled = false;

export function buildCacheKey(
  f: Pick<File, 'name' | 'size'>,
  engine: OcrEngine = 'gemini',
  mode: OcrMode = 'highlight'
): string {
  return `${engine}::${mode}::${f.name}::${f.size}`;
}

function fileDedupeKey(f: Pick<File, 'name' | 'size'>): string {
  return `${f.name}::${f.size}`;
}

function lookupCache(
  cache: Record<string, string>,
  f: Pick<File, 'name' | 'size'>,
  engine: OcrEngine,
  mode: OcrMode
): string | undefined {
  const exact = cache[buildCacheKey(f, engine, mode)];
  if (exact !== undefined) return exact;
  if (mode === 'highlight') {
    const legacyEngine = cache[`${engine}::${f.name}::${f.size}`];
    if (legacyEngine !== undefined) return legacyEngine;
  }
  return undefined;
}

function putInBoundedCache(
  cache: Record<string, string>,
  key: string,
  value: string
): Record<string, string> {
  const next = { ...cache };
  if (key in next) delete next[key];
  next[key] = value;
  const keys = Object.keys(next);
  if (keys.length > MAX_CACHE_ENTRIES) {
    const excess = keys.length - MAX_CACHE_ENTRIES;
    for (let i = 0; i < excess; i++) {
      delete next[keys[i]];
    }
  }
  return next;
}

function rebindFilesToSelection(
  files: OcrFile[],
  cache: Record<string, string>,
  engine: OcrEngine,
  mode: OcrMode
): OcrFile[] {
  return files.map((item) => {
    if (item.status === 'processing') return item;
    const cached = lookupCache(cache, item.file, engine, mode);
    if (cached !== undefined) {
      return {
        ...item,
        status: 'success',
        resultText: cached,
        errorMessage: undefined,
        infoMessage: undefined,
        quotaSaved: false,
      };
    }
    return {
      ...item,
      status: 'idle',
      resultText: undefined,
      errorMessage: undefined,
      infoMessage: undefined,
      quotaSaved: false,
    };
  });
}

async function ensureCompressed(
  state: OcrState,
  fileId: string,
  engine: OcrEngine
): Promise<File> {
  const target = state.files.find((f) => f.id === fileId);
  if (!target) throw new Error('File not found');
  if (target.compressed && engine !== 'groq') return target.compressed;
  return downscaleImage(target.file, {
    target: engine === 'paddle' ? 'local' : 'cloud',
    rotationDeg: engine === 'paddle' ? 0 : target.rotationDeg,
    autoUprightSideways: engine === 'groq',
  });
}

type SetState = {
  (partial: Partial<OcrState> | ((s: OcrState) => Partial<OcrState>)): void;
};

interface ExtractOutcome {
  usedNetwork: boolean;
}

async function extractOneWithRetries(
  getState: () => OcrState,
  setState: SetState,
  fileId: string,
  signal: AbortSignal,
  opts: { modeOverride?: OcrMode; skipColorPrecheck?: boolean } = {}
): Promise<ExtractOutcome> {
  const initialState = getState();
  const target = initialState.files.find((f) => f.id === fileId);
  if (!target) return { usedNetwork: false };

  const engine = initialState.selectedEngine;
  const mode = opts.modeOverride ?? initialState.extractionMode;

  setState((s) => ({
    files: s.files.map((f) =>
      f.id === fileId
        ? {
            ...f,
            status: 'processing',
            errorMessage: undefined,
            infoMessage: undefined,
            quotaSaved: false,
          }
        : f
    ),
  }));

  let compressed: File | null = null;
  if (engine !== 'paddle') {
    const needsFreshTransform = engine === 'groq' || Boolean(target.rotationDeg);
    compressed =
      !needsFreshTransform && target.compressed
        ? target.compressed
        : await downscaleImage(target.file, {
            target: 'cloud',
            rotationDeg: target.rotationDeg,
            autoUprightSideways: engine === 'groq',
          });

    if (!target.compressed && !needsFreshTransform) {
      setState((s) => ({
        files: s.files.map((f) => (f.id === fileId ? { ...f, compressed: compressed ?? undefined } : f)),
      }));
    }
  }

  // Zero-Quota Waste: si el usuario pide SOLO resaltado en un motor con cuota (Gemini/Groq)
  // y la página no tiene ni una sola celda con color de marcador, evitamos gastar cuota de API.
  if (engine !== 'paddle' && compressed && mode === 'highlight' && !opts.skipColorPrecheck) {
    const hasHighlight = await checkBlobHasHighlight(compressed);
    if (signal.aborted) return { usedNetwork: false };
    if (!hasHighlight) {
      const sentinel = NO_HIGHLIGHT_SENTINEL;
      setState((s) => ({
        quotaSavedCount: s.quotaSavedCount + 1,
        files: s.files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: 'success',
                resultText: sentinel,
                errorMessage: undefined,
                infoMessage: undefined,
                quotaSaved: true,
              }
            : f
        ),
        textCache: putInBoundedCache(
          s.textCache,
          buildCacheKey(target.file, engine, mode),
          sentinel
        ),
      }));
      return { usedNetwork: false };
    }
  }

  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    if (signal.aborted) return { usedNetwork: false };

    try {
      let text: string;
      let boxes: OcrBox[] | undefined;
      let autoRot: 0 | 90 | 180 | 270 | undefined;

      if (engine === 'paddle') {
        const localRes = await recognizeLocal(target.file, mode);
        if (signal.aborted) return { usedNetwork: false };
        text = localRes.text;
        boxes = localRes.boxes;
        autoRot = localRes.rotationDeg;
      } else {
        if (!compressed) throw new Error('Error al preparar la imagen');
        const res = await processOcr(compressed, compressed.name, engine, mode, signal);
        const rawJson = await res.json().catch(() => null);
        const parsed = rawJson ? ExtractResponseSchema.safeParse(rawJson) : null;
        const body = parsed?.success ? parsed.data : null;

        if (!res.ok || body?.status === 'error') {
          const errMsg = body?.warnings?.[0] ?? res.statusText ?? 'Error desconocido';
          if (res.status === 429 || isRateLimitMessage(errMsg)) {
            throw new Error('RateLimit');
          }
          if (
            res.status === 503 ||
            res.status === 502 ||
            res.status === 504 ||
            isUpstreamBusyMessage(errMsg)
          ) {
            throw new Error('UpstreamBusy');
          }
          throw new Error(errMsg);
        }
        if (!body) throw new Error('Respuesta inválida del servidor');
        text =
          body.text === NO_HIGHLIGHT_SENTINEL || body.text === 'Sin texto legible en la imagen.'
            ? body.text
            : cleanOcrText(body.text);
      }

      if (signal.aborted) {
        setState((s) => ({
          textCache: putInBoundedCache(
            s.textCache,
            buildCacheKey(target.file, engine, mode),
            text
          ),
        }));
        return { usedNetwork: engine !== 'paddle' };
      }

      setState((s) => ({
        files: s.files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: 'success',
                resultText: text,
                boxes: boxes ?? f.boxes,
                rotationDeg: autoRot !== undefined ? autoRot : f.rotationDeg,
                errorMessage: undefined,
                infoMessage: undefined,
                quotaSaved: false,
              }
            : f
        ),
        textCache: putInBoundedCache(
          s.textCache,
          buildCacheKey(target.file, engine, mode),
          text
        ),
      }));
      return { usedNetwork: engine !== 'paddle' };
    } catch (err: unknown) {
      if (signal.aborted) return { usedNetwork: engine !== 'paddle' };

      const e = err as Error;
      if (e.name === 'AbortError') return { usedNetwork: engine !== 'paddle' };

      attempt++;
      const isRate = e.message === 'RateLimit';
      const isBusy = e.message === 'UpstreamBusy';
      const attemptCap = isRate || isBusy ? MAX_BUSY_ATTEMPTS : MAX_ATTEMPTS;
      const canRetry = engine !== 'paddle' && attempt < attemptCap;

      if (!canRetry) {
        setState((s) => ({
          files: s.files.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  status: 'error',
                  errorMessage: isRate
                    ? 'Cuota gratuita agotada en este motor. Cambiá a Groq o al motor Local (PP-OCRv6 sin cuota).'
                    : isBusy
                      ? 'El modelo en la nube está saturado. Probá de nuevo o cambiá al motor Local.'
                      : e.message || 'Error desconocido',
                  infoMessage: undefined,
                }
              : f
          ),
        }));
        return { usedNetwork: engine !== 'paddle' };
      }

      const waitSec = isRate || isBusy ? attempt * 7 : attempt * 3;
      const maxShown = attemptCap - 1;
      setState((s) => ({
        files: s.files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                infoMessage: isRate
                  ? `Cuidando cuota IA, esperando ${waitSec}s (intento ${attempt}/${maxShown})...`
                  : isBusy
                    ? `Modelo ocupado, reintentando en ${waitSec}s (intento ${attempt}/${maxShown})...`
                    : `Reintentando en ${waitSec}s (intento ${attempt}/${maxShown})...`,
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

  return { usedNetwork: engine !== 'paddle' };
}

const memoryFallback = new Map<string, string>();
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      if (typeof window !== 'undefined' && typeof window.localStorage?.getItem === 'function') {
        return window.localStorage.getItem(name);
      }
    } catch {
      /* ignore restricted storage */
    }
    return memoryFallback.get(name) ?? null;
  },
  setItem: (name, value) => {
    try {
      if (typeof window !== 'undefined' && typeof window.localStorage?.setItem === 'function') {
        window.localStorage.setItem(name, value);
        return;
      }
    } catch {
      /* QuotaExceededError or private mode */
    }
    memoryFallback.set(name, value);
  },
  removeItem: (name) => {
    try {
      if (typeof window !== 'undefined' && typeof window.localStorage?.removeItem === 'function') {
        window.localStorage.removeItem(name);
        return;
      }
    } catch {
      /* ignore */
    }
    memoryFallback.delete(name);
  },
};

export const useOcrStore = create<OcrState>()(
  persist(
    (set, get) => ({
      files: [],
      activeFileId: null,
      globalStatus: 'idle',
      globalProgress: 0,
      selectedEngine: 'gemini',
      extractionMode: 'highlight',
      fontSize: 16,
      textCache: {},
      quotaSavedCount: 0,
      lastClearedSnapshot: null,

      setSelectedEngine: (engine) =>
        set((s) => ({
          selectedEngine: engine,
          globalStatus: s.globalStatus === 'working' ? s.globalStatus : 'idle',
          files: rebindFilesToSelection(s.files, s.textCache, engine, s.extractionMode),
        })),

      setExtractionMode: (mode) =>
        set((s) => ({
          extractionMode: mode,
          globalStatus: s.globalStatus === 'working' ? s.globalStatus : 'idle',
          files: rebindFilesToSelection(s.files, s.textCache, s.selectedEngine, mode),
        })),

      setFontSize: (size) => set({ fontSize: Math.min(28, Math.max(12, Math.round(size))) }),

      rotateFilePreview: (id) =>
        set((s) => ({
          files: s.files.map((f) => {
            if (f.id !== id) return f;
            const nextDeg = (((f.rotationDeg ?? 0) + 90) % 360) as 0 | 90 | 180 | 270;
            return { ...f, rotationDeg: nextDeg, compressed: undefined };
          }),
        })),

      addFiles: (newFiles) => {
        const state = get();
        const existingKeys = new Set(state.files.map((f) => fileDedupeKey(f.file)));
        const duplicates: string[] = [];
        const oversized: string[] = [];
        const seenInBatch = new Set<string>();
        const valid: File[] = [];

        for (const f of newFiles) {
          const key = fileDedupeKey(f);
          if (f.size > MAX_FILE_SIZE_BYTES) {
            oversized.push(f.name);
            continue;
          }
          if (existingKeys.has(key) || seenInBatch.has(key)) {
            duplicates.push(f.name);
            continue;
          }
          seenInBatch.add(key);
          valid.push(f);
        }

        const remainingSlots = Math.max(0, MAX_FILES - state.files.length);
        const accepted = valid.slice(0, remainingSlots);
        const capExceeded = valid.length - accepted.length;

        if (accepted.length > 0) {
          set((s) => {
            const ocrFiles: OcrFile[] = accepted.map((f) => {
              const cached = lookupCache(s.textCache, f, s.selectedEngine, s.extractionMode);
              return {
                id: crypto.randomUUID(),
                file: f,
                previewUrl: URL.createObjectURL(f),
                status: cached !== undefined ? 'success' : 'idle',
                resultText: cached,
              };
            });
            return {
              files: [...s.files, ...ocrFiles],
              activeFileId: s.activeFileId || ocrFiles[0]?.id || null,
              globalStatus: 'idle',
              globalProgress: 0,
            };
          });
        }

        return {
          acceptedCount: accepted.length,
          duplicates,
          oversized,
          capExceeded,
        };
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
              state.activeFileId === id ? (remaining[0]?.id ?? null) : state.activeFileId,
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
            ? putInBoundedCache(
                state.textCache,
                buildCacheKey(target.file, state.selectedEngine, state.extractionMode),
                text
              )
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
        set((s) => ({
          globalStatus: 'idle',
          globalProgress: 0,
          files: s.files.map((f) =>
            f.status === 'processing'
              ? { ...f, status: 'idle', infoMessage: undefined }
              : f
          ),
        }));
      },

      processOne: async (id) => {
        const ac = new AbortController();
        abortController = ac;
        cancelled = false;
        set({ globalStatus: 'working' });
        await extractOneWithRetries(get, set, id, ac.signal, { skipColorPrecheck: true });
        if (!ac.signal.aborted && !cancelled) set({ globalStatus: 'done' });
      },

      processOneFullPage: async (id) => {
        const ac = new AbortController();
        abortController = ac;
        cancelled = false;
        set({ globalStatus: 'working' });
        await extractOneWithRetries(get, set, id, ac.signal, {
          modeOverride: 'full',
          skipColorPrecheck: true,
        });
        if (!ac.signal.aborted && !cancelled) set({ globalStatus: 'done' });
      },

      forceRetry: async (id) => {
        const target = get().files.find((f) => f.id === id);
        if (!target) return;
        set((s) => {
          const exactKey = buildCacheKey(target.file, s.selectedEngine, s.extractionMode);
          const legacyEngineKey = `${s.selectedEngine}::${target.file.name}::${target.file.size}`;
          const nextCache = { ...s.textCache };
          delete nextCache[exactKey];
          delete nextCache[legacyEngineKey];
          return {
            textCache: nextCache,
            files: s.files.map((f) =>
              f.id === id
                ? {
                    ...f,
                    status: 'idle',
                    resultText: undefined,
                    errorMessage: undefined,
                    infoMessage: undefined,
                    quotaSaved: false,
                  }
                : f
            ),
          };
        });
        await get().processOne(id);
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

          const currentEngine = get().selectedEngine;
          const nextId = toProcess[i + 1]?.id;
          const prewarm =
            nextId && currentEngine !== 'paddle'
              ? ensureCompressed(get(), nextId, currentEngine)
                  .then((c) =>
                    set((s) => ({
                      files: s.files.map((f) => (f.id === nextId ? { ...f, compressed: c } : f)),
                    }))
                  )
                  .catch(() => {})
              : Promise.resolve();

          const outcome = await extractOneWithRetries(get, set, toProcess[i].id, signal);

          const processedCount = i + 1;
          set({ globalProgress: Math.round((processedCount / toProcess.length) * 100) });

          if (i < toProcess.length - 1 && !signal.aborted) {
            const interFileDelay = !outcome.usedNetwork
              ? 0
              : get().selectedEngine === 'paddle'
                ? 0
                : get().selectedEngine === 'groq'
                  ? INTER_FILE_DELAY_GROQ_MS
                  : INTER_FILE_DELAY_GEMINI_MS;

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
                      { once: true }
                    );
                  }),
            ]);
          }
        }

        if (!cancelled && !signal.aborted) set({ globalStatus: 'done' });
      },

      retryAllErrors: async () => {
        const errored = get().files.filter((f) => f.status === 'error');
        if (errored.length === 0) return;
        await get().processSelected(errored.map((f) => f.id));
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
                ? (remaining[0]?.id ?? null)
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
              : f
          ),
        }));

        abortController = new AbortController();
        cancelled = false;
        const { signal } = abortController;

        set({ globalStatus: 'working', globalProgress: 0 });

        for (let i = 0; i < toProcess.length; i++) {
          if (signal.aborted || cancelled) break;

          const currentEngine = get().selectedEngine;
          const nextId = toProcess[i + 1]?.id;
          const prewarm =
            nextId && currentEngine !== 'paddle'
              ? ensureCompressed(get(), nextId, currentEngine)
                  .then((c) =>
                    set((s) => ({
                      files: s.files.map((f) => (f.id === nextId ? { ...f, compressed: c } : f)),
                    }))
                  )
                  .catch(() => {})
              : Promise.resolve();

          const outcome = await extractOneWithRetries(get, set, toProcess[i].id, signal);

          const processedCount = i + 1;
          set({ globalProgress: Math.round((processedCount / toProcess.length) * 100) });

          if (i < toProcess.length - 1 && !signal.aborted) {
            const interFileDelay = !outcome.usedNetwork
              ? 0
              : get().selectedEngine === 'paddle'
                ? 0
                : get().selectedEngine === 'groq'
                  ? INTER_FILE_DELAY_GROQ_MS
                  : INTER_FILE_DELAY_GEMINI_MS;

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
                      { once: true }
                    );
                  }),
            ]);
          }
        }

        if (!cancelled && !signal.aborted) set({ globalStatus: 'done' });
      },
    }),
    {
      name: 'ocr-web-state',
      version: 6,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persistedState: unknown, version: number) => {
        const prev = (persistedState ?? {}) as Partial<OcrState>;
        // En v6 limpiamos textCache anterior (v1-v5) para purgar transcripciones previas
        // al detector cuadrilátero, auto-rotación 270° y modelo latin_PP-OCRv5.
        return {
          selectedEngine: prev.selectedEngine ?? 'gemini',
          extractionMode: prev.extractionMode ?? 'highlight',
          fontSize: prev.fontSize ?? 16,
          textCache: version < 6 ? {} : (prev.textCache ?? {}),
        };
      },
      partialize: (state) => ({
        selectedEngine: state.selectedEngine,
        extractionMode: state.extractionMode,
        fontSize: state.fontSize,
        textCache: state.textCache,
      }),
    }
  )
);

export const ocrSelectors = {
  files: (s: OcrState) => s.files,
  activeFile: (s: OcrState) => s.files.find((f) => f.id === s.activeFileId),
  activeFileId: (s: OcrState) => s.activeFileId,
  globalStatus: (s: OcrState) => s.globalStatus,
  globalProgress: (s: OcrState) => s.globalProgress,
  selectedEngine: (s: OcrState) => s.selectedEngine,
  extractionMode: (s: OcrState) => s.extractionMode,
  quotaSavedCount: (s: OcrState) => s.quotaSavedCount,
  fontSize: (s: OcrState) => s.fontSize,
  hasUndo: (s: OcrState) => !!s.lastClearedSnapshot,
};
