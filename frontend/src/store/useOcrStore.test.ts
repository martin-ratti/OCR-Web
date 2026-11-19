import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildCacheKey, ensureCompressed, useOcrStore } from './useOcrStore';
import { isRateLimitMessage, isUpstreamBusyMessage } from '../shared/api';
import { buildUniqueZipFilenames } from '../lib/exporters';
import { isSupportedImageFile, partitionSupportedImages } from '../lib/addFilesFeedback';
import { buildCloudTransformKey } from '../lib/imageDownscale';

describe('useOcrStore', () => {
  beforeEach(() => {
    useOcrStore.setState({
      files: [],
      activeFileId: null,
      globalStatus: 'idle',
      globalProgress: 0,
      isProcessingBatch: false,
      batchTotal: 0,
      batchCompleted: 0,
      selectedEngine: 'gemini',
      extractionMode: 'highlight',
      fontSize: 16,
      textCache: {},
      quotaSavedCount: 0,
      lastClearedSnapshot: null,
    });
  });

  it('initializes with default state', () => {
    const state = useOcrStore.getState();
    expect(state.files).toEqual([]);
    expect(state.selectedEngine).toBe('gemini');
    expect(state.extractionMode).toBe('highlight');
    expect(state.globalStatus).toBe('idle');
    expect(state.isProcessingBatch).toBe(false);
    expect(state.batchTotal).toBe(0);
    expect(state.batchCompleted).toBe(0);
  });

  it('updates selected engine and extraction mode', () => {
    useOcrStore.getState().setSelectedEngine('paddle');
    useOcrStore.getState().setExtractionMode('full');
    expect(useOcrStore.getState().selectedEngine).toBe('paddle');
    expect(useOcrStore.getState().extractionMode).toBe('full');
  });

  it('clamps and updates font size', () => {
    useOcrStore.getState().setFontSize(20);
    expect(useOcrStore.getState().fontSize).toBe(20);
    useOcrStore.getState().setFontSize(99);
    expect(useOcrStore.getState().fontSize).toBe(28);
  });

  it('adds valid image files and assigns activeFileId', () => {
    const fakeFile = new File(['content'], 'test.png', { type: 'image/png' });
    const result = useOcrStore.getState().addFiles([fakeFile]);

    expect(result.acceptedCount).toBe(1);
    expect(result.duplicates).toHaveLength(0);
    expect(result.oversized).toHaveLength(0);

    const state = useOcrStore.getState();
    expect(state.files).toHaveLength(1);
    expect(state.files[0].file.name).toBe('test.png');
    expect(state.activeFileId).toBe(state.files[0].id);
  });

  it('prevents adding duplicate files by name and size', () => {
    const fakeFile1 = new File(['content'], 'test.png', { type: 'image/png' });
    const fakeFile2 = new File(['content'], 'test.png', { type: 'image/png' });

    useOcrStore.getState().addFiles([fakeFile1]);
    const result = useOcrStore.getState().addFiles([fakeFile2]);

    expect(result.acceptedCount).toBe(0);
    expect(result.duplicates).toContain('test.png');
    expect(useOcrStore.getState().files).toHaveLength(1);
  });

  it('rejects oversized files > 5MB', () => {
    const largeContent = new Uint8Array(5 * 1024 * 1024 + 10);
    const oversizedFile = new File([largeContent], 'huge.png', { type: 'image/png' });

    const result = useOcrStore.getState().addFiles([oversizedFile]);
    expect(result.acceptedCount).toBe(0);
    expect(result.oversized).toContain('huge.png');
    expect(useOcrStore.getState().files).toHaveLength(0);
  });

  it('rehydrates cached text using engine + mode cache key and rebinds when switching mode', () => {
    const fakeFile = new File(['data'], 'doc.png', { type: 'image/png' });
    const highlightKey = buildCacheKey(fakeFile, 'groq', 'highlight');
    const fullKey = buildCacheKey(fakeFile, 'groq', 'full');

    useOcrStore.setState({
      selectedEngine: 'groq',
      extractionMode: 'highlight',
      textCache: {
        [highlightKey]: 'Frase resaltada en amarillo',
        [fullKey]: 'Página entera transcripta por Groq',
      },
    });

    useOcrStore.getState().addFiles([fakeFile]);
    expect(useOcrStore.getState().files[0].status).toBe('success');
    expect(useOcrStore.getState().files[0].resultText).toBe('Frase resaltada en amarillo');

    // Al cambiar a modo 'full', se rehidrata automáticamente la transcripción completa cacheada
    useOcrStore.getState().setExtractionMode('full');
    expect(useOcrStore.getState().files[0].status).toBe('success');
    expect(useOcrStore.getState().files[0].resultText).toBe('Página entera transcripta por Groq');

    // Al cambiar a un motor sin caché para esa foto ('paddle'), pasa a 'idle' listo para procesar
    useOcrStore.getState().setSelectedEngine('paddle');
    expect(useOcrStore.getState().files[0].status).toBe('idle');
    expect(useOcrStore.getState().files[0].resultText).toBeUndefined();
  });

  it('updates file result immediately and debounces cache persistence (or flushes on immediateCache)', () => {
    vi.useFakeTimers();
    try {
      const fakeFile = new File(['data'], 'doc.png', { type: 'image/png' });
      useOcrStore.getState().addFiles([fakeFile]);
      const fileId = useOcrStore.getState().files[0].id;

      useOcrStore.getState().updateFileResult(fileId, 'Nuevo texto editado');
      useOcrStore.getState().rotateFilePreview(fileId);

      // El texto activo se actualiza al instante sin esperar el debounce
      expect(useOcrStore.getState().files[0].resultText).toBe('Nuevo texto editado');
      expect(useOcrStore.getState().files[0].rotationDeg).toBe(90);
      expect(useOcrStore.getState().textCache['gemini::highlight::doc.png::4']).toBeUndefined();

      vi.advanceTimersByTime(310);
      expect(useOcrStore.getState().textCache['gemini::highlight::doc.png::4']).toBe(
        'Nuevo texto editado'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses prewarmed compressed image for Groq when compressedTransformKey matches', async () => {
    const raw = new File(['raw-data'], 'page.jpg', { type: 'image/jpeg' });
    const prewarmed = new File(['prewarmed-data'], 'page.webp', { type: 'image/webp' });
    const transformKey = buildCloudTransformKey(undefined, true);

    useOcrStore.getState().addFiles([raw]);
    const id = useOcrStore.getState().files[0].id;

    useOcrStore.setState((s) => ({
      selectedEngine: 'groq',
      files: s.files.map((f) =>
        f.id === id ? { ...f, compressed: prewarmed, compressedTransformKey: transformKey } : f
      ),
    }));

    const res = await ensureCompressed(useOcrStore.getState(), id, 'groq');
    expect(res.file).toBe(prewarmed);
    expect(res.transformKey).toBe(transformKey);
  });

  it('guards processAll and processSelected from re-entering when isProcessingBatch is true', async () => {
    const fakeFile = new File(['data'], 'doc.png', { type: 'image/png' });
    useOcrStore.getState().addFiles([fakeFile]);
    const id = useOcrStore.getState().files[0].id;

    useOcrStore.setState({ isProcessingBatch: true, globalStatus: 'working' });
    await useOcrStore.getState().processAll();
    await useOcrStore.getState().processSelected([id]);

    // No debe haber alterado el estado de la hoja porque ya había un lote en curso
    expect(useOcrStore.getState().files[0].status).toBe('idle');
  });
});

describe('file validator & ZIP collision helpers', () => {
  it('accepts .heic/.heif files on Windows when file.type is empty, and rejects .svg/.bmp/.gif', () => {
    const heicEmptyMime = new File(['heic'], 'IMG_4021.HEIC', { type: '' });
    const heifOctet = new File(['heif'], 'photo.heif', { type: 'application/octet-stream' });
    const svgFile = new File(['<svg/>'], 'diagram.svg', { type: 'image/svg+xml' });
    const bmpFile = new File(['bmp'], 'scan.bmp', { type: 'image/bmp' });
    const gifFile = new File(['gif'], 'anim.gif', { type: 'image/gif' });

    expect(isSupportedImageFile(heicEmptyMime)).toBe(true);
    expect(isSupportedImageFile(heifOctet)).toBe(true);
    expect(isSupportedImageFile(svgFile)).toBe(false);
    expect(isSupportedImageFile(bmpFile)).toBe(false);
    expect(isSupportedImageFile(gifFile)).toBe(false);

    const partitioned = partitionSupportedImages([heicEmptyMime, svgFile, bmpFile]);
    expect(partitioned.images).toHaveLength(1);
    expect(partitioned.rejected).toBe(2);
    expect(partitioned.rejectedNames).toEqual(['diagram.svg', 'scan.bmp']);
  });

  it('prevents filename collisions in ZIP export by appending _2, _3 suffixes', () => {
    const entries = buildUniqueZipFilenames([
      { filename: 'apunte.jpg', text: 'Hoja 1' },
      { filename: 'apunte.png', text: 'Hoja 2' },
      { filename: 'APUNTE.webp', text: 'Hoja 3' },
      { filename: 'resumen.jpg', text: 'Hoja 4' },
    ]);

    expect(entries.map((e) => e.entryName)).toEqual([
      'Apunte_apunte.txt',
      'Apunte_apunte_2.txt',
      'Apunte_APUNTE_3.txt',
      'Apunte_resumen.txt',
    ]);
  });
});

describe('api error matchers', () => {
  it('correctly detects rate limit messages', () => {
    expect(isRateLimitMessage('RESOURCE_EXHAUSTED: quota exceeded')).toBe(true);
    expect(isRateLimitMessage('Rate limit (429)')).toBe(true);
    expect(isRateLimitMessage('Normal error message')).toBe(false);
  });

  it('correctly detects upstream busy / transient messages', () => {
    expect(isUpstreamBusyMessage('Model is currently experiencing high demand (503)')).toBe(true);
    expect(isUpstreamBusyMessage('UNAVAILABLE: temporarily overloaded')).toBe(true);
    expect(isUpstreamBusyMessage('File not found')).toBe(false);
  });
});
