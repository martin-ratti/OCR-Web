import { describe, it, expect, beforeEach } from 'vitest';
import { useOcrStore } from './useOcrStore';
import { isRateLimitMessage, isUpstreamBusyMessage } from '../shared/api';

describe('useOcrStore', () => {
  beforeEach(() => {
    // Reset store state
    useOcrStore.setState({
      files: [],
      activeFileId: null,
      globalStatus: 'idle',
      globalProgress: 0,
      selectedEngine: 'gemini',
      fontSize: 15,
      textCache: {},
      lastClearedSnapshot: null,
    });
  });

  it('initializes with default state', () => {
    const state = useOcrStore.getState();
    expect(state.files).toEqual([]);
    expect(state.selectedEngine).toBe('gemini');
    expect(state.globalStatus).toBe('idle');
  });

  it('updates selected engine', () => {
    useOcrStore.getState().setSelectedEngine('groq');
    expect(useOcrStore.getState().selectedEngine).toBe('groq');
  });

  it('updates font size', () => {
    useOcrStore.getState().setFontSize(18);
    expect(useOcrStore.getState().fontSize).toBe(18);
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

  it('rehydrates cached text using engine-specific cache key', () => {
    const fakeFile = new File(['data'], 'doc.png', { type: 'image/png' });

    // Seed cache for groq engine
    useOcrStore.setState({
      selectedEngine: 'groq',
      textCache: {
        'groq::doc.png::4': 'Texto completo transcripto por Groq',
      },
    });

    useOcrStore.getState().addFiles([fakeFile]);
    const fileEntry = useOcrStore.getState().files[0];

    expect(fileEntry.status).toBe('success');
    expect(fileEntry.resultText).toBe('Texto completo transcripto por Groq');
  });

  it('updates file result and updates engine-aware cache', () => {
    const fakeFile = new File(['data'], 'doc.png', { type: 'image/png' });
    useOcrStore.getState().addFiles([fakeFile]);
    const fileId = useOcrStore.getState().files[0].id;

    useOcrStore.getState().updateFileResult(fileId, 'Nuevo texto editado');

    const state = useOcrStore.getState();
    expect(state.files[0].resultText).toBe('Nuevo texto editado');
    expect(state.textCache['gemini::doc.png::4']).toBe('Nuevo texto editado');
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
