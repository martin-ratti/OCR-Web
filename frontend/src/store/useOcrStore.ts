import { create } from 'zustand';

export type OcrStatus = 'idle' | 'processing' | 'success' | 'error';

export interface OcrFile {
  id: string; // ID único para react keys
  file: File;
  previewUrl: string; // Creado con URL.createObjectURL()
  status: OcrStatus;
  resultText?: string;
  errorMessage?: string;
}

interface OcrState {
  files: OcrFile[];
  activeFileId: string | null;
  globalStatus: 'idle' | 'working' | 'done';
  globalProgress: number; // 0 a 100

  // Actions
  addFiles: (files: File[]) => void;
  setActiveFile: (id: string) => void;
  removeFile: (id: string) => void;
  clearAll: () => void;
  
  // OCR Actions
  processAll: () => Promise<void>;
  updateFileResult: (id: string, text: string) => void;
}

export const useOcrStore = create<OcrState>((set, get) => ({
  files: [],
  activeFileId: null,
  globalStatus: 'idle',
  globalProgress: 0,

  addFiles: (newFiles) => {
    const ocrFiles: OcrFile[] = newFiles.map(f => ({
      id: crypto.randomUUID(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      status: 'idle'
    }));

    set(state => {
      const updatedFiles = [...state.files, ...ocrFiles];
      return { 
        files: updatedFiles,
        // Auto select the first newly added file if none active
        activeFileId: state.activeFileId || (ocrFiles.length > 0 ? ocrFiles[0].id : null)
      };
    });
  },

  setActiveFile: (id) => set({ activeFileId: id }),

  removeFile: (id) => set(state => {
    const fileToRemove = state.files.find(f => f.id === id);
    if (fileToRemove) URL.revokeObjectURL(fileToRemove.previewUrl);
    
    const newFiles = state.files.filter(f => f.id !== id);
    return {
      files: newFiles,
      activeFileId: state.activeFileId === id ? (newFiles[0]?.id || null) : state.activeFileId
    };
  }),

  clearAll: () => set(state => {
    state.files.forEach(f => URL.revokeObjectURL(f.previewUrl));
    return { files: [], activeFileId: null, globalStatus: 'idle', globalProgress: 0 };
  }),

  updateFileResult: (id, text) => set(state => ({
    files: state.files.map(f => f.id === id ? { ...f, resultText: text, status: 'success' } : f)
  })),

  processAll: async () => {
    const state = get();
    const filesToProcess = state.files.filter(f => f.status === 'idle' || f.status === 'error');
    if (filesToProcess.length === 0) return;

    set({ globalStatus: 'working', globalProgress: 0 });

    let processedCount = 0;

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      
      set(s => ({
        files: s.files.map(f => f.id === file.id ? { ...f, status: 'processing' } : f)
      }));

      let attempt = 0;
      const maxAttempts = 5; // Aumentado a 5 reintentos
      let success = false;

      while (attempt < maxAttempts && !success) {
        try {
          const formData = new FormData();
          formData.append('image', file.file);

          const response = await fetch('http://localhost:3001/api/ocr/extract', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => null);
            const errMsg = errData?.warnings?.[0] || response.statusText;
            
            const isRateLimit = response.status === 429 || response.status === 503 || 
                                /RESOURCE_EXHAUSTED|Quota|exhausted|rate limit|429/i.test(errMsg);
                                
            if (isRateLimit) {
               throw new Error('RateLimit');
            }
            throw new Error(`Error HTTP: ${errMsg}`);
          }

          const data = await response.json();
          
          if (data.status === 'error') {
             const isRateLimit = response.status === 429 || /RESOURCE_EXHAUSTED|Quota|exhausted|rate limit|429/i.test(data.warnings?.[0] || '');
             if(isRateLimit){
                throw new Error('RateLimit');
             }
             throw new Error(data.warnings?.[0] || 'Unknown error');
          }

          set(s => ({
            files: s.files.map(f => f.id === file.id ? { ...f, status: 'success', resultText: data.text, errorMessage: undefined } : f)
          }));
          success = true;

        } catch (err: any) {
          if (err.message === 'RateLimit' && attempt < maxAttempts - 1) {
            attempt++;
            
            const waitTime = attempt * 15; // Aumentamos un poco el tiempo de espera (15, 30, 45...)
            const backoffTime = waitTime * 1000;
            
            set(s => ({
              files: s.files.map(f => f.id === file.id ? { ...f, errorMessage: `Ayy no. La IA está a mil. Esperando ${waitTime} segunditos para volver a intentar (Intento ${attempt}/${maxAttempts - 1})...` } : f)
            }));
            
            await new Promise(res => setTimeout(res, backoffTime));
            continue;
          }
          
          set(s => ({
            files: s.files.map(f => f.id === file.id ? { ...f, status: 'error', errorMessage: err.message === 'RateLimit' ? 'Límite de la IA alcanzado. ¡La cuota gratuita se agotó! Intentá de nuevo en un rato o con menos fotos.' : err.message } : f)
          }));
          break;
        }
      }

      // Si quedan archivos por procesar, aguardamos 6 segundos para respetar el límite de 15 RPM y evitar error (Pide paciencia)
      if(i < filesToProcess.length - 1) {
         await new Promise(res => setTimeout(res, 6000));
      }

      processedCount++;
      set({ globalProgress: Math.round((processedCount / filesToProcess.length) * 100) });
    }

    set({ globalStatus: 'done' });
  }
}));
